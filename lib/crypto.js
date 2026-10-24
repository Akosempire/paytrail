import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

function key() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) throw new Error("APP_ENCRYPTION_KEY must be set (32+ characters).");
  return createHash("sha256").update(raw).digest();
}

// AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, all base64url.
export function encryptSecret(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(sealed) {
  if (!sealed) return "";
  const [version, iv, tag, data] = String(sealed).split(".");
  if (version !== "v1") throw new Error("Unknown secret format.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("hex");
}

export function sha256(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

export function hint(secret) {
  const s = String(secret || "");
  return s.length > 4 ? s.slice(-4) : "";
}
