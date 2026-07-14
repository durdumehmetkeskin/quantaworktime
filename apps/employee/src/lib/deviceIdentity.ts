import * as Keychain from "react-native-keychain";

import { fromBase64Url, sha256Bytes, toBase64Url } from "@quanta/shared";

/** Keychain service holding the device key (shared with deviceKey.ts). */
export const DEVICE_KEY_SERVICE = "quanta.employee.deviceKey";

/** Raw device key from the keystore, or null when none exists (fresh install). */
export async function getStoredDeviceKey(): Promise<Uint8Array | null> {
  const stored = await Keychain.getGenericPassword({ service: DEVICE_KEY_SERVICE });
  if (!stored) return null;
  return fromBase64Url(stored.password);
}

/**
 * base64url SHA-256 of the device key — sent with login/refresh so the server
 * can enforce the one-device-per-account rule. Null on fresh installs (the
 * server then allows login so the device can register itself).
 */
export async function getDeviceFingerprint(): Promise<string | null> {
  const key = await getStoredDeviceKey();
  return key ? toBase64Url(sha256Bytes(key)) : null;
}
