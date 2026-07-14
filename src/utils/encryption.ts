// src/utils/encryption.ts
// ─────────────────────────────────────────────────────────────────────────────
// AES-256-CBC encryption for sensitive tenant credentials.
// Unlike bcrypt (one-way hash), this is two-way — we can decrypt and USE
// the credentials in API calls.
//
// ENCRYPTION_KEY must be a 64-char hex string (32 bytes).
// Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is not set in .env");
  if (key.length !== 64) throw new Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  return Buffer.from(key, "hex");
}

// Encrypts a plaintext string → returns "iv:encryptedHex"
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

// Decrypts "iv:encryptedHex" → returns original plaintext
export function decrypt(ciphertext: string): string {
  const [ivHex, encryptedHex] = ciphertext.split(":");
  if (!ivHex || !encryptedHex) throw new Error("Invalid encrypted value format");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

// Safe decrypt — returns null instead of throwing
export function safeDecrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  try { return decrypt(ciphertext); }
  catch { return null; }
}
