import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, MoreThanOrEqual, Repository } from "typeorm";

import {
  AttendanceType,
  buildDeviceSignatureMessage,
  computeBleResponse,
  DUPLICATE_WINDOW_SECONDS,
  fromBase64Url,
  hmacSha256,
  NONCE_HISTORY_SIZE,
  parseQrToken,
  QR_TS_MAX_SKEW_SECONDS,
  timingSafeEqual,
  toBase64Url,
  verifyQrSignature,
  type CheckResponse,
  type QrPayload,
} from "@quanta/shared";

import { AttendanceRecord, Challenge, QrNonce, User, UserShift } from "../../entities";
import { AuditService } from "../audit/audit.service";
import { DevicesService } from "../devices/devices.service";
import { TabletsService } from "../tablets/tablets.service";
import type { CheckDto } from "./dto/attendance.dtos";
import { computeEarlyLeaveMinutes, computeLateMinutes, toIstanbul } from "./shift-matching.util";

/**
 * Implements the 9-step verification chain from the spec (§3). Any failing
 * step writes an audit log entry and aborts with 403. Steps are numbered in
 * the code to mirror the spec exactly.
 */
@Injectable()
export class AttendanceVerificationService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Challenge) private readonly challenges: Repository<Challenge>,
    @InjectRepository(QrNonce) private readonly nonces: Repository<QrNonce>,
    @InjectRepository(AttendanceRecord) private readonly records: Repository<AttendanceRecord>,
    @InjectRepository(UserShift) private readonly userShifts: Repository<UserShift>,
    private readonly tabletsService: TabletsService,
    private readonly devicesService: DevicesService,
    private readonly audit: AuditService,
  ) {}

  async verifyAndRecord(userId: string, dto: CheckDto, ip?: string): Promise<CheckResponse> {
    const now = new Date();
    const nowSec = Math.floor(now.getTime() / 1000);

    const fail = async (step: number, reason: string, detail: Record<string, unknown> = {}) => {
      await this.audit.log({
        userId,
        action: "ATTENDANCE_CHECK_FAILED",
        detail: { step, reason, challengeId: dto.challengeId, type: dto.type, ...detail },
        ip,
      });
      throw new ForbiddenException("Doğrulama başarısız. Lütfen tablete tekrar okutun.");
    };

    // Step 1 — JWT is already validated by the guard; the user must be active.
    const user = await this.users.findOneBy({ id: userId });
    if (!user || !user.isActive) {
      await fail(1, "user_inactive");
    }

    // Step 2 — request must come from the user's registered ACTIVE device.
    const activeDevice = await this.devicesService.findActiveWithKey(userId);
    if (!activeDevice) {
      await fail(2, "no_active_device");
    }
    const expectedDeviceSig = hmacSha256(
      activeDevice!.key,
      buildDeviceSignatureMessage(dto.challengeId, dto.bleResponse, dto.clientTs),
    );
    if (!this.safeEqualB64(expectedDeviceSig, dto.deviceSignature)) {
      await fail(2, "device_signature_mismatch", { deviceId: activeDevice!.device.id });
    }

    // Step 3 — QR signature must verify against the tablet secret.
    let qr: QrPayload;
    try {
      qr = parseQrToken(dto.qrPayload);
    } catch {
      return fail(3, "qr_malformed") as never;
    }
    const tablet = await this.tabletsService.getOrThrow(qr.tid).catch(() => null);
    if (!tablet || !tablet.isActive) {
      await fail(3, "tablet_unknown_or_inactive", { tabletId: qr.tid });
    }
    const tabletSecret = this.tabletsService.getSecret(tablet!);
    if (!tabletSecret || !verifyQrSignature(qr, tabletSecret)) {
      await fail(3, "qr_signature_invalid", { tabletId: qr.tid });
    }

    // Step 4 — QR timestamp within ±60s of server time.
    if (Math.abs(nowSec - qr.ts) > QR_TS_MAX_SKEW_SECONDS) {
      await fail(4, "qr_expired", { qrTs: qr.ts, nowSec });
    }

    // Step 5 — nonce is single-use. Insert if unseen (tablet may not have
    // synced yet), then atomically claim it; the unique index makes the
    // race between concurrent requests safe.
    try {
      await this.nonces.insert({
        tabletId: qr.tid,
        nonce: qr.n,
        issuedTs: String(qr.ts),
      });
    } catch {
      // duplicate — already known, possibly already used
    }
    const nonceClaim = await this.nonces.update(
      { nonce: qr.n, usedAt: IsNull() },
      { usedAt: now, usedByUserId: userId },
    );
    if (!nonceClaim.affected) {
      await fail(5, "nonce_replayed", { nonce: qr.n });
    }

    // Step 6 — challenge belongs to this user + tablet, unexpired, single-use
    // (atomic claim).
    const challenge = await this.challenges.findOneBy({ id: dto.challengeId });
    if (!challenge || challenge.userId !== userId || challenge.tabletId !== qr.tid) {
      await fail(6, "challenge_not_owned");
    }
    const challengeClaim = await this.challenges.update(
      { id: dto.challengeId, usedAt: IsNull(), expiresAt: MoreThanOrEqual(now) },
      { usedAt: now },
    );
    if (!challengeClaim.affected) {
      await fail(6, "challenge_expired_or_used");
    }

    // Step 7 — BLE proximity proof: response must equal
    // HMAC(tabletSecret, challenge.nonce) for one of the tablet's recent nonces.
    const challengeB64 = toBase64Url(new Uint8Array(challenge!.challenge));
    const recentNonces = await this.nonces.find({
      where: { tabletId: qr.tid },
      order: { issuedTs: "DESC" },
      take: NONCE_HISTORY_SIZE,
    });
    const candidateNonces = [qr.n, ...recentNonces.map((n) => n.nonce)];
    const bleValid = candidateNonces.some((nonceB64) =>
      this.safeEqualB64(computeBleResponse(tabletSecret!, challengeB64, nonceB64), dto.bleResponse),
    );
    if (!bleValid) {
      const diagnosis = await this.diagnoseBleMismatch(
        userId,
        tabletSecret!,
        candidateNonces,
        dto.bleResponse,
        dto.challengeId,
      );
      // If the tablet echoed its inputs, check its internal consistency too:
      // consistent echo + mismatch means the INPUTS diverged (visible in echo);
      // inconsistent echo means the response was corrupted in transit.
      let echoAnalysis: string | undefined;
      if (dto.bleEcho) {
        const [echoChallenge, echoNonce] = dto.bleEcho.split("|");
        const expected = hmacSha256(tabletSecret!, `${echoChallenge}.${echoNonce}`);
        const selfConsistent = this.safeEqualB64(expected, dto.bleResponse);
        echoAnalysis = `selfConsistent=${selfConsistent} echoChallenge=${echoChallenge} echoNonce=${echoNonce} issuedChallenge=${challengeB64}`;
      }
      await fail(7, "ble_response_invalid", {
        tabletId: qr.tid,
        qrNonce: qr.n,
        candidates: candidateNonces,
        diagnosis,
        ...(echoAnalysis ? { echoAnalysis } : {}),
      });
    }

    // Step 8 — no duplicate record for this user within the idempotency window.
    const windowStart = new Date(now.getTime() - DUPLICATE_WINDOW_SECONDS * 1000);
    const recent = await this.records.findOne({
      where: { userId, timestamp: MoreThanOrEqual(windowStart) },
      order: { timestamp: "DESC" },
    });
    if (recent) {
      await fail(8, "duplicate_within_window", { recentRecordId: recent.id });
    }

    // Step 9 — persist and match against the user's shift.
    const { lateMinutes, earlyLeaveMinutes } = await this.matchShift(userId, dto.type, now);
    const record = await this.records.save(
      this.records.create({
        userId,
        tabletId: qr.tid,
        type: dto.type,
        timestamp: now,
        challengeId: dto.challengeId,
        lateMinutes,
        earlyLeaveMinutes,
        isManual: false,
      }),
    );

    await this.audit.log({
      userId,
      action: "ATTENDANCE_CHECK_OK",
      detail: { recordId: record.id, type: dto.type, tabletId: qr.tid },
      ip,
    });

    return {
      id: record.id,
      type: record.type,
      timestamp: record.timestamp.toISOString(),
      lateMinutes,
      earlyLeaveMinutes,
      message:
        dto.type === AttendanceType.IN
          ? lateMinutes > 0
            ? `Giriş kaydedildi (${lateMinutes} dk geç).`
            : "Giriş kaydedildi. İyi çalışmalar!"
          : earlyLeaveMinutes > 0
            ? `Çıkış kaydedildi (${earlyLeaveMinutes} dk erken).`
            : "Çıkış kaydedildi. İyi günler!",
    };
  }

  /** Finds the shift effective today and computes late/early-leave minutes. */
  private async matchShift(
    userId: string,
    type: AttendanceType,
    at: Date,
  ): Promise<{ lateMinutes: number; earlyLeaveMinutes: number }> {
    const local = toIstanbul(at);
    const assignments = await this.userShifts.find({
      where: { userId },
      relations: { shift: true },
    });
    const effective = assignments
      .filter((a) => a.effectiveFrom <= local.dateStr && (!a.effectiveTo || a.effectiveTo >= local.dateStr))
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
    if (!effective?.shift) return { lateMinutes: 0, earlyLeaveMinutes: 0 };

    return {
      lateMinutes: type === AttendanceType.IN ? computeLateMinutes(effective.shift, local) : 0,
      earlyLeaveMinutes:
        type === AttendanceType.OUT ? computeEarlyLeaveMinutes(effective.shift, local) : 0,
    };
  }

  /**
   * TEMPORARY field diagnostic: when the BLE proof fails, sweep encoding
   * variants and the user's recent challenges to pinpoint WHERE the tablet's
   * computation diverges. Result lands in the audit detail; remove once the
   * root cause is fixed.
   */
  private async diagnoseBleMismatch(
    userId: string,
    tabletSecret: Uint8Array,
    candidateNonces: string[],
    bleResponseB64: string,
    currentChallengeId: string,
  ): Promise<string> {
    const toStd = (b64url: string) => {
      const std = b64url.replace(/-/g, "+").replace(/_/g, "/");
      return std + "=".repeat((4 - (std.length % 4)) % 4);
    };
    const recent = await this.challenges.find({
      where: { userId },
      order: { createdAt: "DESC" },
      take: 6,
    });
    for (const ch of recent) {
      const canonical = toBase64Url(new Uint8Array(ch.challenge));
      const variants: Array<[string, string]> = [
        ["url-nopad", canonical],
        ["std-pad", toStd(canonical)],
        ["url-pad", canonical + "=".repeat((4 - (canonical.length % 4)) % 4)],
        ["std-nopad", canonical.replace(/-/g, "+").replace(/_/g, "/")],
      ];
      for (const [variantName, challengeStr] of variants) {
        for (const nonce of candidateNonces) {
          const hm = hmacSha256(tabletSecret, `${challengeStr}.${nonce}`);
          if (this.safeEqualB64(hm, bleResponseB64)) {
            const stale = ch.id !== currentChallengeId ? "STALE_CHALLENGE" : "CURRENT_CHALLENGE";
            return `MATCH: ${stale} id=${ch.id} encoding=${variantName} nonce=${nonce}`;
          }
        }
      }
    }
    return "NO_MATCH: response fits none of (6 recent challenges x 4 encodings x candidates)";
  }

  private safeEqualB64(expected: Uint8Array, actualB64: string): boolean {
    let actual: Uint8Array;
    try {
      actual = fromBase64Url(actualB64);
    } catch {
      return false;
    }
    return timingSafeEqual(expected, actual);
  }
}
