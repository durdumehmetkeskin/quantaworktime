/**
 * Isomorphic crypto helpers — run identically in Node (NestJS API) and
 * React Native (kiosk + employee apps). All primitives come from
 * @noble/hashes (pure JS, audited); no Node `crypto` or `Buffer` usage.
 *
 * React Native note: `randomBytes` relies on a CSPRNG
 * (`globalThis.crypto.getRandomValues`). RN apps must import
 * `react-native-get-random-values` once at their entry point.
 */
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes as nobleRandomBytes, utf8ToBytes } from "@noble/hashes/utils";

import { BLE_TABLET_ID_HASH_BYTES, QR_PAYLOAD_VERSION } from "./constants";
import type { QrPayload } from "./types";

// ---------------------------------------------------------------------------
// base64url (RFC 4648 §5, no padding) — implemented without Buffer/atob so it
// works on Hermes, JSC and Node alike.
// ---------------------------------------------------------------------------

const B64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64URL_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64URL_ALPHABET.length; i++) B64URL_LOOKUP[B64URL_ALPHABET[i]] = i;

export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64URL_ALPHABET[b0 >> 2];
    out += B64URL_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64URL_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64URL_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function fromBase64Url(str: string): Uint8Array {
  const clean = str.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64URL_LOOKUP[clean[i]];
    const c1 = B64URL_LOOKUP[clean[i + 1]];
    const c2 = clean[i + 2] !== undefined ? B64URL_LOOKUP[clean[i + 2]] : undefined;
    const c3 = clean[i + 3] !== undefined ? B64URL_LOOKUP[clean[i + 3]] : undefined;
    if (c0 === undefined || c1 === undefined) throw new Error("Invalid base64url input");
    out[outIdx++] = (c0 << 2) | (c1 >> 4);
    if (c2 !== undefined) out[outIdx++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    if (c3 !== undefined) out[outIdx++] = ((c2! & 0x03) << 6) | c3;
  }
  return out;
}

export function utf8Encode(str: string): Uint8Array {
  return utf8ToBytes(str);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if (b < 0xe0) {
      cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else if (b < 0xf0) {
      cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
    } else {
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      i += 4;
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function randomBytes(length: number): Uint8Array {
  return nobleRandomBytes(length);
}

export function sha256Bytes(message: Uint8Array | string): Uint8Array {
  return sha256(typeof message === "string" ? utf8ToBytes(message) : message);
}

export function hmacSha256(key: Uint8Array, message: Uint8Array | string): Uint8Array {
  return hmac(sha256, key, typeof message === "string" ? utf8ToBytes(message) : message);
}

/** Constant-time comparison; never early-exits on content (only on length). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Protocol message canonicalisation — the ONLY definitions of what gets
// signed. Tablet, phone and server all use these to stay byte-compatible.
// ---------------------------------------------------------------------------

/** Message signed in the QR payload: `tid.ts.nonce`. */
export function buildQrSignatureMessage(tabletId: string, ts: number, nonceB64: string): string {
  return `${tabletId}.${ts}.${nonceB64}`;
}

/** Message the tablet HMACs over BLE: `challenge.nonce` (both base64url). */
export function buildBleResponseMessage(challengeB64: string, nonceB64: string): string {
  return `${challengeB64}.${nonceB64}`;
}

/** Message the phone signs with its deviceKey: `challengeId.bleResponse.clientTs`. */
export function buildDeviceSignatureMessage(
  challengeId: string,
  bleResponseB64: string,
  clientTs: number,
): string {
  return `${challengeId}.${bleResponseB64}.${clientTs}`;
}

/** Message a tablet signs to authenticate heartbeat/nonce-sync calls: `tabletId.ts`. */
export function buildTabletAuthMessage(tabletId: string, ts: number): string {
  return `${tabletId}.${ts}`;
}

// ---------------------------------------------------------------------------
// High-level helpers shared by kiosk and server
// ---------------------------------------------------------------------------

/** Builds and signs a QR payload; returns payload + the base64url QR token. */
export function createQrToken(
  tabletId: string,
  tabletSecret: Uint8Array,
  nowEpochSeconds: number,
  nonce?: Uint8Array,
): { payload: QrPayload; token: string } {
  const n = toBase64Url(nonce ?? randomBytes(16));
  const ts = Math.floor(nowEpochSeconds);
  const sig = toBase64Url(hmacSha256(tabletSecret, buildQrSignatureMessage(tabletId, ts, n)));
  const payload: QrPayload = { v: QR_PAYLOAD_VERSION, tid: tabletId, ts, n, sig };
  return { payload, token: toBase64Url(utf8Encode(JSON.stringify(payload))) };
}

/** Decodes a QR token back into its payload. Throws on malformed input. */
export function parseQrToken(token: string): QrPayload {
  const json = utf8Decode(fromBase64Url(token));
  const parsed = JSON.parse(json) as QrPayload;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.tid !== "string" ||
    typeof parsed.ts !== "number" ||
    typeof parsed.n !== "string" ||
    typeof parsed.sig !== "string"
  ) {
    throw new Error("Malformed QR payload");
  }
  return parsed;
}

/** Verifies the HMAC signature of a parsed QR payload. */
export function verifyQrSignature(payload: QrPayload, tabletSecret: Uint8Array): boolean {
  const expected = hmacSha256(
    tabletSecret,
    buildQrSignatureMessage(payload.tid, payload.ts, payload.n),
  );
  let actual: Uint8Array;
  try {
    actual = fromBase64Url(payload.sig);
  } catch {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

/** Tablet-side (and server-side verification) BLE challenge response. */
export function computeBleResponse(
  tabletSecret: Uint8Array,
  challengeB64: string,
  nonceB64: string,
): Uint8Array {
  return hmacSha256(tabletSecret, buildBleResponseMessage(challengeB64, nonceB64));
}

/** Phone-side device signature over the check-in request. */
export function computeDeviceSignature(
  deviceKey: Uint8Array,
  challengeId: string,
  bleResponseB64: string,
  clientTs: number,
): Uint8Array {
  return hmacSha256(deviceKey, buildDeviceSignatureMessage(challengeId, bleResponseB64, clientTs));
}

/** Short hash of tabletId placed in the BLE advertisement manufacturer data. */
export function shortTabletIdHash(tabletId: string): Uint8Array {
  return sha256Bytes(tabletId).slice(0, BLE_TABLET_ID_HASH_BYTES);
}
