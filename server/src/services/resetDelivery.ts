import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import jwt from "jsonwebtoken";
import { connection } from "../config/db";
import { getJwtSecret } from "../config/security";
import { sendPasswordResetEmail } from "./emailService";
import { buildResetLink } from "./resetLink";
const key = () =>
  process.env.RESET_DELIVERY_KEY
    ? Buffer.from(process.env.RESET_DELIVERY_KEY, "hex")
    : createHash("sha256").update(getJwtSecret()).digest();
function encrypt(value: string) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv);
  return Buffer.concat([
    iv,
    c.update(value),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64");
}
function decrypt(value: string) {
  const data = Buffer.from(value, "base64"),
    c = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  c.setAuthTag(data.subarray(-16));
  return Buffer.concat([
    c.update(data.subarray(12, -16)),
    c.final(),
  ]).toString();
}
export async function queuePasswordReset(email: string) {
  const user = (
    await connection.query(
      "SELECT id,email,password_reset_version FROM users WHERE email=$1 AND NOT disabled",
      [email],
    )
  ).rows[0];
  // Same database round trip class for unknown accounts; no provider latency or credentials in response.
  if (!user) return;
  const token = jwt.sign(
    {
      id: user.id,
      purpose: "password-reset",
      resetVersion: user.password_reset_version,
    },
    getJwtSecret(),
    { expiresIn: "15m", issuer: "imsop-api", audience: "imsop-password-reset" },
  );
  const url = buildResetLink(
    process.env.PASSWORD_RESET_BASE_URL ||
      "http://localhost:5173/#/reset-password",
    token,
  );
  await connection.query(
    `INSERT INTO reset_deliveries(id,user_id,reset_version,encrypted_payload,expires_at) VALUES($1,$2,$3,$4,now()+interval '15 minutes')
 ON CONFLICT(user_id,reset_version) DO UPDATE SET id=EXCLUDED.id,encrypted_payload=EXCLUDED.encrypted_payload,expires_at=EXCLUDED.expires_at,state='pending',attempts=0,next_attempt_at=now()
 WHERE reset_deliveries.expires_at<now() OR reset_deliveries.state='failed'`,
    [
      randomUUID(),
      user.id,
      user.password_reset_version,
      encrypt(JSON.stringify({ email: user.email, url })),
    ],
  );
}
export async function dispatchResetDeliveries() {
  await connection.query(
    `UPDATE reset_deliveries SET state='expired',encrypted_payload=NULL WHERE expires_at<=now() AND encrypted_payload IS NOT NULL`,
  );
  const claimed =
    await connection.query(`WITH due AS (SELECT id FROM reset_deliveries WHERE state IN ('pending','sending') AND expires_at>now() AND next_attempt_at<=now()
 AND (lease_until IS NULL OR lease_until<now()) AND attempts<5 ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED)
 UPDATE reset_deliveries d SET state='sending',attempts=attempts+1,lease_until=now()+interval '60 seconds' FROM due WHERE d.id=due.id RETURNING d.*`);
  for (const row of claimed.rows) {
    try {
      const { email, url } = JSON.parse(decrypt(row.encrypted_payload));
      await sendPasswordResetEmail(email, url, row.id);
      await connection.query(
        "UPDATE reset_deliveries SET state='sent',delivered_at=now(),encrypted_payload=NULL,lease_until=NULL WHERE id=$1",
        [row.id],
      );
    } catch {
      await connection.query(
        `UPDATE reset_deliveries SET state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,lease_until=NULL,next_attempt_at=now()+interval '30 seconds'*power(2,attempts),encrypted_payload=CASE WHEN attempts>=5 THEN NULL ELSE encrypted_payload END WHERE id=$1`,
        [row.id],
      );
      console.warn(
        JSON.stringify({
          event: "reset_delivery_failed",
          deliveryId: row.id,
          attempt: row.attempts,
        }),
      );
    }
  }
}
