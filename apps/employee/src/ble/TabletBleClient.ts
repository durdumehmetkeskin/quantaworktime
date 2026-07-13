import { PermissionsAndroid, Platform } from "react-native";

import {
  BLE_CHALLENGE_CHARACTERISTIC_UUID,
  BLE_RESPONSE_CHARACTERISTIC_UUID,
  BLE_SERVICE_UUID,
  computeBleResponse,
  fromBase64Url,
  shortTabletIdHash,
  timingSafeEqual,
  toBase64Url,
} from "@quanta/shared";

/**
 * Proximity proof step (spec §2): write the server challenge to the tablet
 * over BLE and read back HMAC(tabletSecret, challenge.nonce).
 */
export interface BleResult {
  /** HMAC response, base64url. */
  response: string;
  /** Optional "challenge|nonce" echo from the tablet (diagnostics). */
  echo?: string;
}

export interface TabletBleClient {
  /** Returns the tablet's response (and echo), or throws (Turkish message). */
  getBleResponse(tabletId: string, challengeB64: string): Promise<BleResult>;
}

export async function requestBleScanPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true; // iOS: Info.plist NSBluetoothAlwaysUsageDescription
  if (Platform.Version < 31) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return Object.values(results).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

/** Standard (padded) base64 <-> bytes, required by react-native-ble-plx. */
function bytesToStdBase64(bytes: Uint8Array): string {
  const b64url = toBase64Url(bytes);
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return b64 + "=".repeat((4 - (b64.length % 4)) % 4);
}

function stdBase64ToBytes(b64: string): Uint8Array {
  return fromBase64Url(b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
}

const SCAN_TIMEOUT_MS = 15_000;

/** Real implementation over react-native-ble-plx (BLE central). */
export class BlePlxTabletClient implements TabletBleClient {
  // Lazy require keeps the module loadable in environments without the native lib.
  private manager: import("react-native-ble-plx").BleManager | null = null;

  private getManager(): import("react-native-ble-plx").BleManager {
    if (!this.manager) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("react-native-ble-plx") as typeof import("react-native-ble-plx");
      this.manager = new mod.BleManager();
    }
    return this.manager;
  }

  async getBleResponse(tabletId: string, challengeB64: string): Promise<BleResult> {
    const granted = await requestBleScanPermissions();
    if (!granted) throw new Error("Bluetooth izni verilmedi.");
    const manager = this.getManager();
    const expectedHash = shortTabletIdHash(tabletId);

    const device = await new Promise<import("react-native-ble-plx").Device>((resolve, reject) => {
      const timer = setTimeout(() => {
        manager.stopDeviceScan();
        reject(new Error("Tablet yakınında bulunamadı. Lütfen tablete yaklaşın."));
      }, SCAN_TIMEOUT_MS);

      manager.startDeviceScan([BLE_SERVICE_UUID], null, (error, scanned) => {
        if (error) {
          clearTimeout(timer);
          manager.stopDeviceScan();
          reject(new Error("Bluetooth taraması başarısız oldu."));
          return;
        }
        if (!scanned) return;
        // Match the advertised short tabletId hash so we talk to the RIGHT tablet.
        const serviceData = scanned.serviceData?.[BLE_SERVICE_UUID];
        if (serviceData) {
          const advertisedHash = stdBase64ToBytes(serviceData);
          if (!timingSafeEqual(advertisedHash, expectedHash)) return;
        }
        clearTimeout(timer);
        manager.stopDeviceScan();
        resolve(scanned);
      });
    });

    try {
      // requestMTU: the 89-byte echo response must fit a single read — the
      // default 23-byte MTU forces blob reads, which proved unreliable.
      const connected = await device.connect({ timeout: 10_000, requestMTU: 187 });
      await connected.discoverAllServicesAndCharacteristics();
      await connected.writeCharacteristicWithResponseForService(
        BLE_SERVICE_UUID,
        BLE_CHALLENGE_CHARACTERISTIC_UUID,
        bytesToStdBase64(fromBase64Url(challengeB64)),
      );
      const characteristic = await connected.readCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_RESPONSE_CHARACTERISTIC_UUID,
      );
      if (!characteristic.value) throw new Error("Tablet yanıt vermedi.");
      const raw = stdBase64ToBytes(characteristic.value);
      // New tablets answer "challenge|nonce|hmac" (ASCII); old ones raw 32 bytes.
      const asText = String.fromCharCode(...raw);
      const parts = asText.split("|");
      if (parts.length === 3 && /^[A-Za-z0-9_-]{43}$/.test(parts[2])) {
        return { response: parts[2], echo: `${parts[0]}|${parts[1]}` };
      }
      return { response: toBase64Url(raw) };
    } finally {
      await device.cancelConnection().catch(() => undefined);
    }
  }
}

/**
 * Development mock (spec Faz 6: "önce mock BLE ile"). Computes the response
 * locally from a known tablet secret + the nonce inside the scanned QR —
 * byte-identical to what a real tablet would return, no radio needed.
 */
export class MockTabletBleClient implements TabletBleClient {
  constructor(
    private readonly tabletSecretB64: string,
    private readonly currentNonceProvider: () => string,
  ) {}

  async getBleResponse(_tabletId: string, challengeB64: string): Promise<BleResult> {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 600)); // simulate radio latency
    return {
      response: toBase64Url(
        computeBleResponse(
          fromBase64Url(this.tabletSecretB64),
          challengeB64,
          this.currentNonceProvider(),
        ),
      ),
    };
  }
}
