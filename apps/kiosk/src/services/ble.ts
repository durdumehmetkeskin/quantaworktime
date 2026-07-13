import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";

import {
  BLE_CHALLENGE_CHARACTERISTIC_UUID,
  BLE_RESPONSE_CHARACTERISTIC_UUID,
  BLE_SERVICE_UUID,
  shortTabletIdHash,
  toBase64Url,
} from "@quanta/shared";

/**
 * Bridge to the native Kotlin GATT server (BleGattServerModule).
 * The native side advertises the fixed service UUID with the tablet's short
 * id-hash in the service data, accepts challenge writes and serves the
 * HMAC(secret, challenge.nonce) response — computed natively so a GATT read
 * never has to wait for the JS thread.
 */
interface BleGattServerNativeModule {
  startServer(
    serviceUuid: string,
    challengeCharUuid: string,
    responseCharUuid: string,
    tabletIdHashB64: string,
  ): Promise<boolean>;
  updateSecretAndNonce(tabletSecretB64Url: string, currentNonceB64Url: string): Promise<void>;
  stopServer(): Promise<void>;
}

const native = NativeModules.BleGattServer as BleGattServerNativeModule | undefined;

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  if (Platform.Version < 31) return true; // pre-Android 12: manifest-only
  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

export async function startGattServer(tabletId: string): Promise<boolean> {
  if (!native) {
    console.warn("BleGattServer native module not linked — BLE disabled (dev mode).");
    return false;
  }
  return native.startServer(
    BLE_SERVICE_UUID,
    BLE_CHALLENGE_CHARACTERISTIC_UUID,
    BLE_RESPONSE_CHARACTERISTIC_UUID,
    toBase64Url(shortTabletIdHash(tabletId)),
  );
}

/** Must be called on every QR rotation so the response HMAC uses the fresh nonce. */
export async function updateBleState(tabletSecretB64: string, nonceB64: string): Promise<void> {
  if (!native) return;
  await native.updateSecretAndNonce(tabletSecretB64, nonceB64);
}

export async function stopGattServer(): Promise<void> {
  if (!native) return;
  await native.stopServer();
}

/** Subscribe to native events (challenge received etc.) for UI feedback. */
export function onBleEvent(
  event: "onChallengeReceived" | "onCentralConnected",
  handler: () => void,
): () => void {
  if (!native) return () => undefined;
  const emitter = new NativeEventEmitter(NativeModules.BleGattServer);
  const sub = emitter.addListener(event, handler);
  return () => sub.remove();
}
