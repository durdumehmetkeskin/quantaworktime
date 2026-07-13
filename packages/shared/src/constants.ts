/** QR code payload rotation period on the kiosk tablet. */
export const QR_ROTATION_SECONDS = 30;

/** Maximum allowed clock skew between QR `ts` and server time. */
export const QR_TS_MAX_SKEW_SECONDS = 60;

/** Challenge lifetime after issuance. */
export const CHALLENGE_TTL_SECONDS = 45;

/** Window in which a second check by the same user is rejected as duplicate. */
export const DUPLICATE_WINDOW_SECONDS = 60;

/** Number of recent nonces the tablet keeps in RAM and the server tries during BLE verification. */
export const NONCE_HISTORY_SIZE = 5;

/** QR payload schema version. */
export const QR_PAYLOAD_VERSION = 1;

/** Tablet heartbeat interval. */
export const HEARTBEAT_INTERVAL_SECONDS = 300;

/** Max clock skew accepted for tablet-signed API calls (heartbeat, nonce sync). */
export const TABLET_AUTH_MAX_SKEW_SECONDS = 60;

/** Fixed BLE GATT service UUID advertised by every kiosk tablet. */
export const BLE_SERVICE_UUID = "8f1e0001-4b2a-4d9e-9c6b-2f9d1a7e5c01";

/** Characteristic the phone WRITES the raw challenge bytes to. */
export const BLE_CHALLENGE_CHARACTERISTIC_UUID = "8f1e0002-4b2a-4d9e-9c6b-2f9d1a7e5c01";

/** Characteristic the phone READS the HMAC response from. */
export const BLE_RESPONSE_CHARACTERISTIC_UUID = "8f1e0003-4b2a-4d9e-9c6b-2f9d1a7e5c01";

/** Length (bytes) of the short tabletId hash placed in the BLE advertisement payload. */
export const BLE_TABLET_ID_HASH_BYTES = 4;

/** Sizes in bytes. */
export const TABLET_SECRET_BYTES = 32;
export const DEVICE_KEY_BYTES = 32;
export const QR_NONCE_BYTES = 16;
export const CHALLENGE_BYTES = 16;

/** All timestamps are stored in UTC; user-facing display uses Europe/Istanbul (fixed UTC+3 since 2016). */
export const DISPLAY_TIMEZONE = "Europe/Istanbul";
export const ISTANBUL_UTC_OFFSET_MINUTES = 180;
