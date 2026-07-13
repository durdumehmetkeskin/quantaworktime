import {
  buildTabletAuthMessage,
  fromBase64Url,
  hmacSha256,
  toBase64Url,
  type TabletClaimResponse,
} from "@quanta/shared";

import { SERVER_URL } from "../config";
import type { KioskConfig } from "./storage";

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new Error(json.message ?? `Sunucu hatası (${response.status})`);
  }
  return json;
}

/** Signs a tablet-authenticated request body: HMAC(secret, `tabletId.ts`). */
function signedBody(config: KioskConfig): { ts: number; signature: string } {
  const ts = Math.floor(Date.now() / 1000);
  const signature = toBase64Url(
    hmacSha256(fromBase64Url(config.tabletSecret), buildTabletAuthMessage(config.tabletId, ts)),
  );
  return { ts, signature };
}

export function claimTablet(provisionCode: string): Promise<TabletClaimResponse> {
  return post<TabletClaimResponse>(`${SERVER_URL}/tablets/claim`, { provisionCode });
}

export function sendHeartbeat(config: KioskConfig): Promise<{ ok: boolean }> {
  return post(`${SERVER_URL}/tablets/${config.tabletId}/heartbeat`, signedBody(config));
}

export function syncNonces(
  config: KioskConfig,
  nonces: Array<{ nonce: string; issuedTs: number }>,
): Promise<{ ok: boolean; received: number }> {
  return post(`${SERVER_URL}/tablets/${config.tabletId}/nonces`, {
    ...signedBody(config),
    nonces,
  });
}

export function fetchRecentCheckins(
  config: KioskConfig,
): Promise<Array<{ fullName: string; type: string; timestamp: string }>> {
  return post(`${SERVER_URL}/tablets/${config.tabletId}/recent-checkins`, signedBody(config));
}
