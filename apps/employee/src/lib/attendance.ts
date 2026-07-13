import {
  computeDeviceSignature,
  parseQrToken,
  toBase64Url,
  type AttendanceType,
  type ChallengeResponse,
  type CheckRequest,
  type CheckResponse,
} from "@quanta/shared";

import type { TabletBleClient } from "../ble/TabletBleClient";
import { apiRequest, NetworkError } from "./api";
import { getOrCreateDeviceKey } from "./deviceKey";
import { enqueueCheck } from "./offlineQueue";

export type CheckProgress = "challenge" | "ble" | "submit";

export interface CheckFlowResult {
  outcome: "success" | "queued";
  response?: CheckResponse;
}

/**
 * Full check flow (spec §2-3): QR → challenge → BLE proximity proof →
 * deviceSignature → POST /attendance/check.
 *
 * Offline semantics (spec Faz 6): the server evaluates the challenge TTL, not
 * clientTs — so a check can only be queued if the challenge was obtained. If
 * the challenge request itself fails, the caller must tell the user to re-scan
 * later ("çevrimdışı" hatası).
 */
export async function performCheck(
  qrToken: string,
  type: AttendanceType,
  ble: TabletBleClient,
  onProgress: (step: CheckProgress) => void,
): Promise<CheckFlowResult> {
  const qr = parseQrToken(qrToken); // throws on malformed QR

  onProgress("challenge");
  let challenge: ChallengeResponse;
  try {
    challenge = await apiRequest<ChallengeResponse>("/attendance/challenge", {
      method: "POST",
      body: { tabletId: qr.tid },
    });
  } catch (error) {
    if (error instanceof NetworkError) {
      throw new Error("Çevrimdışısınız. Bağlantı gelince tablete tekrar okutun.");
    }
    throw error;
  }

  onProgress("ble");
  const bleResponse = await ble.getBleResponse(qr.tid, challenge.challenge);

  onProgress("submit");
  const clientTs = Math.floor(Date.now() / 1000);
  const deviceKey = await getOrCreateDeviceKey();
  const body: CheckRequest = {
    qrPayload: qrToken,
    challengeId: challenge.challengeId,
    bleResponse,
    type,
    deviceSignature: toBase64Url(
      computeDeviceSignature(deviceKey, challenge.challengeId, bleResponse, clientTs),
    ),
    clientTs,
  };

  try {
    const response = await apiRequest<CheckResponse>("/attendance/check", {
      method: "POST",
      body,
    });
    return { outcome: "success", response };
  } catch (error) {
    if (error instanceof NetworkError) {
      // Challenge + BLE proof already obtained → safe to queue and retry
      // within the challenge TTL window.
      await enqueueCheck(body);
      return { outcome: "queued" };
    }
    throw error;
  }
}
