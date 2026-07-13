import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

/** Stored format: `v1:<ivB64>:<tagB64>:<cipherB64>`. */
export function encryptAes256Gcm(key: Buffer, plaintext: Uint8Array): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptAes256Gcm(key: Buffer, stored: string): Uint8Array {
  const [version, ivB64, tagB64, dataB64] = stored.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload format");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return new Uint8Array(
    Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]),
  );
}
