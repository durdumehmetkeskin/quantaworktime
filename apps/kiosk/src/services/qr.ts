import {
  createQrToken,
  fromBase64Url,
  NONCE_HISTORY_SIZE,
  randomBytes,
  toBase64Url,
} from "@quanta/shared";

export interface QrState {
  token: string;
  /** base64url nonce currently shown. */
  nonce: string;
  issuedTs: number;
}

/**
 * Keeps the tablet's last N nonces in RAM (spec §1) and tracks which ones
 * still need to be synced to the server.
 */
export class QrGenerator {
  private history: Array<{ nonce: string; issuedTs: number }> = [];
  private pendingSync: Array<{ nonce: string; issuedTs: number }> = [];

  constructor(
    private readonly tabletId: string,
    private readonly tabletSecretB64: string,
  ) {}

  /** Generates a fresh QR token and rotates the nonce window. Works offline. */
  next(): QrState {
    const nowSec = Math.floor(Date.now() / 1000);
    const nonceBytes = randomBytes(16);
    const { payload, token } = createQrToken(
      this.tabletId,
      fromBase64Url(this.tabletSecretB64),
      nowSec,
      nonceBytes,
    );
    const entry = { nonce: payload.n, issuedTs: nowSec };
    this.history.unshift(entry);
    if (this.history.length > NONCE_HISTORY_SIZE) this.history.pop();
    this.pendingSync.push(entry);
    return { token, nonce: payload.n, issuedTs: nowSec };
  }

  get currentNonce(): string | null {
    return this.history[0]?.nonce ?? null;
  }

  /** Nonces not yet acknowledged by the server; call `markSynced` on success. */
  takePending(): Array<{ nonce: string; issuedTs: number }> {
    return [...this.pendingSync];
  }

  markSynced(entries: Array<{ nonce: string }>): void {
    const synced = new Set(entries.map((e) => e.nonce));
    this.pendingSync = this.pendingSync.filter((e) => !synced.has(e.nonce));
  }
}

export { toBase64Url };
