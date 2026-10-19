import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
export function validatePassword(password: string): void {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw Object.assign(new Error("كلمة المرور يجب أن تكون بين 12 و128 حرفًا."), { status: 400 });
  }
}
export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  const digest = await derive(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${digest.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, hex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !hex || hex.length !== 128 || password.length > 128) return false;
  const digest = await derive(password, salt, 64) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return expected.length === digest.length && timingSafeEqual(expected, digest);
}
