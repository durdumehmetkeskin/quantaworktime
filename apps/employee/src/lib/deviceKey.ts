import { Platform } from "react-native";
import * as Keychain from "react-native-keychain";

import { DEVICE_KEY_BYTES, fromBase64Url, randomBytes, toBase64Url } from "@quanta/shared";

import { apiRequest } from "./api";

const SERVICE = "quanta.employee.deviceKey";

/**
 * The device key is generated ON the phone, never re-derivable elsewhere, and
 * lives only in the Keychain/Keystore. The server stores it encrypted at rest
 * for HMAC verification (device binding, spec §3.2).
 */
/** True if a device key already exists in the keystore (survives updates, lost on uninstall). */
export async function hasStoredDeviceKey(): Promise<boolean> {
  return (await Keychain.getGenericPassword({ service: SERVICE })) !== false;
}

export async function getOrCreateDeviceKey(): Promise<Uint8Array> {
  const stored = await Keychain.getGenericPassword({ service: SERVICE });
  if (stored) return fromBase64Url(stored.password);
  const key = randomBytes(DEVICE_KEY_BYTES);
  await Keychain.setGenericPassword("deviceKey", toBase64Url(key), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

export interface DeviceStatusInfo {
  id: string;
  status: "ACTIVE" | "PENDING_APPROVAL" | "REVOKED";
  platform: string;
  model: string;
}

export async function fetchMyDevice(): Promise<DeviceStatusInfo | null> {
  // When the user has no device the API responds with an empty body, which
  // the fetch layer surfaces as {} — normalize anything without an id to null.
  const device = await apiRequest<DeviceStatusInfo | null>("/devices/me");
  return device && device.id ? device : null;
}

export async function registerDevice(model: string): Promise<{ id: string; status: string; message: string }> {
  const key = await getOrCreateDeviceKey();
  return apiRequest("/auth/register-device", {
    method: "POST",
    body: {
      deviceKey: toBase64Url(key),
      platform: Platform.OS,
      model,
    },
  });
}
