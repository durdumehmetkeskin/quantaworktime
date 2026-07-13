import { createHash } from "node:crypto";

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  buildTabletAuthMessage,
  fromBase64Url,
  HEARTBEAT_INTERVAL_SECONDS,
  hmacSha256,
  randomBytes,
  TABLET_AUTH_MAX_SKEW_SECONDS,
  TABLET_SECRET_BYTES,
  timingSafeEqual,
  toBase64Url,
  type TabletClaimResponse,
} from "@quanta/shared";

import { EncryptionService } from "../../common/crypto/encryption.service";
import { AttendanceRecord, QrNonce, Tablet } from "../../entities";
import { AuditService } from "../audit/audit.service";
import type { NonceItemDto } from "./dto/tablet.dtos";

const PROVISION_CODE_TTL_MS = 24 * 60 * 60 * 1000;
const PROVISION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function hashProvisionCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

@Injectable()
export class TabletsService {
  constructor(
    @InjectRepository(Tablet)
    private readonly tablets: Repository<Tablet>,
    @InjectRepository(QrNonce)
    private readonly nonces: Repository<QrNonce>,
    @InjectRepository(AttendanceRecord)
    private readonly records: Repository<AttendanceRecord>,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ admin

  /** Creates a tablet and a one-time provision code (returned exactly once). */
  async provision(
    name: string,
    location: string,
    adminId: string,
  ): Promise<{ tabletId: string; provisionCode: string; expiresAt: Date }> {
    const provisionCode = this.generateProvisionCode();
    const expiresAt = new Date(Date.now() + PROVISION_CODE_TTL_MS);
    const tablet = await this.tablets.save(
      this.tablets.create({
        name,
        location,
        provisionCodeHash: hashProvisionCode(provisionCode),
        provisionCodeExpiresAt: expiresAt,
      }),
    );
    await this.audit.log({
      userId: adminId,
      action: "TABLET_PROVISIONED",
      detail: { tabletId: tablet.id, name, location },
    });
    return { tabletId: tablet.id, provisionCode, expiresAt };
  }

  /**
   * Rotation: issues a new one-time provision code. The current secret keeps
   * working until the kiosk claims the new code (zero-downtime rotation).
   */
  async rotateSecret(
    tabletId: string,
    adminId: string,
  ): Promise<{ tabletId: string; provisionCode: string; expiresAt: Date }> {
    const tablet = await this.getOrThrow(tabletId);
    const provisionCode = this.generateProvisionCode();
    tablet.provisionCodeHash = hashProvisionCode(provisionCode);
    tablet.provisionCodeExpiresAt = new Date(Date.now() + PROVISION_CODE_TTL_MS);
    await this.tablets.save(tablet);
    await this.audit.log({
      userId: adminId,
      action: "TABLET_SECRET_ROTATION_STARTED",
      detail: { tabletId },
    });
    return { tabletId, provisionCode, expiresAt: tablet.provisionCodeExpiresAt };
  }

  async findAll(): Promise<Array<Omit<Tablet, "tabletSecretEncrypted" | "provisionCodeHash"> & { isOnline: boolean }>> {
    const all = await this.tablets.find({ order: { createdAt: "DESC" } });
    const onlineThreshold = Date.now() - 2 * HEARTBEAT_INTERVAL_SECONDS * 1000;
    return all.map((t) => {
      const { tabletSecretEncrypted: _s, provisionCodeHash: _p, ...safe } = t;
      return {
        ...safe,
        isOnline: !!t.lastSeenAt && t.lastSeenAt.getTime() > onlineThreshold,
      };
    });
  }

  async update(tabletId: string, patch: Partial<Pick<Tablet, "name" | "location" | "isActive">>): Promise<Tablet> {
    const tablet = await this.getOrThrow(tabletId);
    Object.assign(tablet, patch);
    return this.tablets.save(tablet);
  }

  // ------------------------------------------------------------------ kiosk

  /** Kiosk exchanges its one-time provision code for the tablet secret. */
  async claim(provisionCode: string, ip?: string): Promise<TabletClaimResponse> {
    const tablet = await this.tablets.findOneBy({
      provisionCodeHash: hashProvisionCode(provisionCode),
    });
    if (!tablet || !tablet.provisionCodeExpiresAt || tablet.provisionCodeExpiresAt < new Date()) {
      await this.audit.log({
        action: "TABLET_CLAIM_FAILED",
        detail: { reason: !tablet ? "unknown_code" : "expired_code" },
        ip,
      });
      throw new ForbiddenException("Kurulum kodu geçersiz veya süresi dolmuş.");
    }

    const secret = randomBytes(TABLET_SECRET_BYTES);
    tablet.tabletSecretEncrypted = this.encryption.encrypt(secret);
    tablet.provisionCodeHash = null;
    tablet.provisionCodeExpiresAt = null;
    tablet.lastSeenAt = new Date();
    await this.tablets.save(tablet);

    await this.audit.log({
      action: "TABLET_CLAIMED",
      detail: { tabletId: tablet.id },
      ip,
    });
    return {
      tabletId: tablet.id,
      name: tablet.name,
      location: tablet.location,
      tabletSecret: toBase64Url(secret),
    };
  }

  /** Verifies HMAC(tabletSecret, `tabletId.ts`) with ±60s skew; returns the tablet. */
  async verifyTabletSignature(tabletId: string, ts: number, signatureB64: string): Promise<Tablet> {
    const tablet = await this.getOrThrow(tabletId);
    const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
    const secret = this.getSecret(tablet);
    const valid =
      skew <= TABLET_AUTH_MAX_SKEW_SECONDS &&
      secret !== null &&
      timingSafeEqual(
        hmacSha256(secret, buildTabletAuthMessage(tabletId, ts)),
        fromBase64Url(signatureB64),
      );
    if (!valid || !tablet.isActive) {
      await this.audit.log({
        action: "TABLET_AUTH_FAILED",
        detail: { tabletId, skew, inactive: !tablet.isActive },
      });
      throw new ForbiddenException("Tablet doğrulaması başarısız.");
    }
    return tablet;
  }

  async heartbeat(tabletId: string, ts: number, signatureB64: string): Promise<{ ok: true }> {
    const tablet = await this.verifyTabletSignature(tabletId, ts, signatureB64);
    tablet.lastSeenAt = new Date();
    await this.tablets.save(tablet);
    return { ok: true };
  }

  /** Tablet syncs the nonces it generated (idempotent; unique nonce index). */
  async syncNonces(
    tabletId: string,
    ts: number,
    signatureB64: string,
    items: NonceItemDto[],
  ): Promise<{ ok: true; received: number }> {
    const tablet = await this.verifyTabletSignature(tabletId, ts, signatureB64);
    tablet.lastSeenAt = new Date();
    await this.tablets.save(tablet);

    if (items.length > 0) {
      await this.nonces
        .createQueryBuilder()
        .insert()
        .values(
          items.map((n) => ({
            tabletId,
            nonce: n.nonce,
            issuedTs: String(n.issuedTs),
          })),
        )
        .orIgnore()
        .execute();
    }
    return { ok: true, received: items.length };
  }

  /** Last successful check-ins at this tablet (for the kiosk welcome toast). */
  async recentCheckins(
    tabletId: string,
    ts: number,
    signatureB64: string,
  ): Promise<Array<{ fullName: string; type: string; timestamp: Date }>> {
    await this.verifyTabletSignature(tabletId, ts, signatureB64);
    const recent = await this.records.find({
      where: { tabletId },
      relations: { user: true },
      order: { timestamp: "DESC" },
      take: 5,
    });
    return recent.map((r) => ({
      fullName: r.user?.fullName ?? "",
      type: r.type,
      timestamp: r.timestamp,
    }));
  }

  // ---------------------------------------------------------------- helpers

  async getOrThrow(tabletId: string): Promise<Tablet> {
    const tablet = await this.tablets.findOneBy({ id: tabletId });
    if (!tablet) throw new NotFoundException("Tablet bulunamadı.");
    return tablet;
  }

  /** Decrypted tablet secret, or null if not yet claimed. */
  getSecret(tablet: Tablet): Uint8Array | null {
    if (!tablet.tabletSecretEncrypted) return null;
    return this.encryption.decrypt(tablet.tabletSecretEncrypted);
  }

  private generateProvisionCode(): string {
    const bytes = randomBytes(8);
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += PROVISION_CODE_ALPHABET[bytes[i] % PROVISION_CODE_ALPHABET.length];
    }
    return code;
  }
}
