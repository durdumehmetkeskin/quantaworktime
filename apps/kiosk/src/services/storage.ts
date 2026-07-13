import * as Keychain from "react-native-keychain";

export interface KioskConfig {
  serverUrl: string;
  tabletId: string;
  tabletName: string;
  location: string;
  /** base64url, 32 bytes. */
  tabletSecret: string;
}

const SERVICE = "quanta.kiosk.config";

/** Tablet secret lives ONLY in the device keystore (spec: güvenli depo). */
export async function saveConfig(config: KioskConfig): Promise<void> {
  await Keychain.setGenericPassword("kiosk", JSON.stringify(config), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.ALWAYS,
  });
}

export async function loadConfig(): Promise<KioskConfig | null> {
  const credentials = await Keychain.getGenericPassword({ service: SERVICE });
  if (!credentials) return null;
  try {
    return JSON.parse(credentials.password) as KioskConfig;
  } catch {
    return null;
  }
}

export async function clearConfig(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
