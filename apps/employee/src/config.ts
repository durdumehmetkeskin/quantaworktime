/** Fixed production server — the app only ever talks to this API. */
export const SERVER_URL = "https://quantaapi.durdumehmetkeskin.space";

/**
 * Development toggles.
 *
 * USE_MOCK_BLE: run the check flow without a physical tablet (spec Faz 6:
 * "önce mock BLE ile"). The mock computes the BLE response locally from
 * MOCK_TABLET_SECRET (printed by the API seed script) and the nonce of the
 * last scanned QR — byte-identical to a real tablet's answer.
 *
 * Set USE_MOCK_BLE=false for production builds with react-native-ble-plx.
 */
export const USE_MOCK_BLE = false;

/** base64url, 32 bytes — dev tablet secret from `pnpm --filter @quanta/api seed`. */
export const MOCK_TABLET_SECRET = "";
