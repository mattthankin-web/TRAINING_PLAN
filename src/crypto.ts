import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

// AES-256-GCM for OAuth tokens at rest. Output: base64(iv | authTag | ciphertext).

function key(): Buffer {
  const k = Buffer.from(config.tokenEncryptionKey(), "hex");
  if (k.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes of hex (openssl rand -hex 32)");
  return k;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decrypt(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

// Signed, expiring OAuth `state` values, so the callback can trust a state it
// issued without keeping server-side session storage.
export function signState(ttlSeconds = 600): string {
  const payload = `${Date.now() + ttlSeconds * 1000}.${randomBytes(8).toString("hex")}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyState(state: string | undefined): boolean {
  if (!state) return false;
  const idx = state.lastIndexOf(".");
  const payload = state.slice(0, idx);
  const expected = Buffer.from(hmac(payload));
  const given = Buffer.from(state.slice(idx + 1));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(payload.split(".")[0]) > Date.now();
}

function hmac(payload: string) {
  return createHmac("sha256", key()).update(payload).digest("hex");
}

export function secretMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
