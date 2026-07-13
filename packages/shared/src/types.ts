// ---------------------------------------------------------------------------
// Enums (string unions kept identical to DB enum values)
// ---------------------------------------------------------------------------

export enum UserRole {
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  EMPLOYEE = "EMPLOYEE",
}

export enum DeviceStatus {
  ACTIVE = "ACTIVE",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  REVOKED = "REVOKED",
}

export enum AttendanceType {
  IN = "IN",
  OUT = "OUT",
}

export enum TimesheetStatus {
  DRAFT = "DRAFT",
  APPROVED = "APPROVED",
}

// ---------------------------------------------------------------------------
// QR payload (spec §1)
// ---------------------------------------------------------------------------

export interface QrPayload {
  /** Schema version. */
  v: number;
  /** Tablet id (uuid). */
  tid: string;
  /** Unix epoch seconds at generation time. */
  ts: number;
  /** 16-byte random nonce, base64url. */
  n: string;
  /** HMAC-SHA256(tabletSecret, `tid.ts.n`), base64url. */
  sig: string;
}

// ---------------------------------------------------------------------------
// API request/response contracts shared by apps
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUserInfo {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  employeeCode: string | null;
  department: string | null;
}

export interface LoginResponse extends AuthTokens {
  user: AuthUserInfo;
}

export interface RegisterDeviceRequest {
  /** 32-byte device key, base64url. Generated on the phone, kept in Keychain. */
  deviceKey: string;
  platform: string;
  model: string;
}

export interface ChallengeRequest {
  tabletId: string;
}

export interface ChallengeResponse {
  challengeId: string;
  /** 16-byte challenge, base64url. */
  challenge: string;
  /** ISO-8601 UTC expiry. */
  expiresAt: string;
}

export interface CheckRequest {
  /** base64url-encoded QR JSON. */
  qrPayload: string;
  challengeId: string;
  /** base64url HMAC obtained from the tablet over BLE. */
  bleResponse: string;
  type: AttendanceType;
  /** base64url HMAC-SHA256(deviceKey, `challengeId.bleResponse.clientTs`). */
  deviceSignature: string;
  clientTs: number;
  /** Optional "challenge|nonce" echo from the tablet (verification diagnostics). */
  bleEcho?: string;
}

export interface CheckResponse {
  id: string;
  type: AttendanceType;
  timestamp: string;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  /** Turkish confirmation message shown to the employee. */
  message: string;
}

export interface TabletClaimRequest {
  provisionCode: string;
}

export interface TabletClaimResponse {
  tabletId: string;
  name: string;
  location: string;
  /** 32-byte tablet secret, base64url — shown exactly once. */
  tabletSecret: string;
}

export interface TabletHeartbeatRequest {
  /** Unix epoch seconds used in the auth signature. */
  ts: number;
  /** base64url HMAC-SHA256(tabletSecret, `tabletId.ts`). */
  signature: string;
}

export interface TabletNonceSyncRequest extends TabletHeartbeatRequest {
  nonces: Array<{ nonce: string; issuedTs: number }>;
}

/** Standard error envelope returned by the API for every error. */
export interface ApiErrorEnvelope {
  statusCode: number;
  error: string;
  /** Turkish, user-displayable. */
  message: string;
  path: string;
  timestamp: string;
}
