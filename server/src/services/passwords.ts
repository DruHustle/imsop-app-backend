import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
// Full 12–128-character inputs are covered; bcrypt's legacy 72-byte truncation is not used for new writes.
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  if (encoded.startsWith("scrypt$")) {
    const [_, salt, hash] = encoded.split("$");
    if (
      !/^[a-f0-9]{32}$/.test(salt || "") ||
      !/^[a-f0-9]{128}$/.test(hash || "")
    )
      return false;
    return timingSafeEqual(
      await derive(password, Buffer.from(salt, "hex")),
      Buffer.from(hash, "hex"),
    );
  }
  return /^\$2[aby]\$/.test(encoded) && bcrypt.compare(password, encoded);
}
