import { connection } from "../config/db";
import { isEmailConfigured, sendOperationalEmail } from "./emailService";
export const externalMailAvailable = () =>
  process.env.EMAIL_NOTIFICATIONS_ENABLED === "true" &&
  (isEmailConfigured() ||
    (process.env.NODE_ENV !== "production" &&
      process.env.EMAIL_PROVIDER === "smtp"));
export async function dispatchOperationalNotifications() {
  if (!externalMailAvailable()) return;
  await connection.query(
    "UPDATE notification_deliveries SET state='failed',lease_until=NULL WHERE state='sending' AND attempts>=5 AND lease_until<now()",
  );
  await connection.query(
    "UPDATE notification_deliveries SET state='expired',lease_until=NULL WHERE state IN ('pending','sending') AND created_at<now()-interval '72 hours'",
  );
  for (let slot = 0; slot < 5; slot++) {
    const row = (
      await connection.query(`WITH due AS (SELECT id FROM notification_deliveries WHERE state IN ('pending','sending') AND attempts<5 AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
  UPDATE notification_deliveries d SET state='sending',attempts=attempts+1,lease_until=now()+interval '60 seconds' FROM due WHERE d.id=due.id RETURNING d.*`)
    ).rows[0];
    if (!row) break;
    try {
      const evidence = (
        await connection.query(
          `SELECT u.email,s.tracking_number,a.action FROM notification_deliveries d
   JOIN users u ON u.id=d.user_id AND NOT u.disabled AND u.active_workspace_id=d.workspace_id
   JOIN workspace_memberships m ON m.user_id=d.user_id AND m.workspace_id=d.workspace_id
   JOIN notification_preferences p ON p.user_id=d.user_id AND p.workspace_id=d.workspace_id AND p.email_enabled
   JOIN review_actions a ON a.id=d.action_id AND a.workspace_id=d.workspace_id
   JOIN review_cases c ON c.id=a.case_id AND c.workspace_id=d.workspace_id
   JOIN shipments s ON s.id=c.shipment_id AND s.workspace_id=d.workspace_id WHERE d.id=$1`,
          [row.id],
        )
      ).rows[0];
      if (!evidence) {
        await connection.query(
          "UPDATE notification_deliveries SET state='cancelled',lease_until=NULL WHERE id=$1",
          [row.id],
        );
        continue;
      }
      await sendOperationalEmail(
        evidence.email,
        `IMSOP review: ${evidence.tracking_number}`,
        `Review activity for ${evidence.tracking_number}: ${evidence.action}.\nSign in to IMSOP to review the current shipment and audit history. This notice does not confirm carrier delivery.`,
        row.id,
      );
      await connection.query(
        "UPDATE notification_deliveries SET state='sent',delivered_at=now(),lease_until=NULL WHERE id=$1",
        [row.id],
      );
    } catch {
      await connection.query(
        "UPDATE notification_deliveries SET state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,lease_until=NULL,next_attempt_at=now()+interval '30 seconds'*power(2,attempts) WHERE id=$1",
        [row.id],
      );
      console.warn(
        JSON.stringify({
          event: "notification_delivery_failed",
          deliveryId: row.id,
          attempt: row.attempts,
        }),
      );
    }
  }
}
