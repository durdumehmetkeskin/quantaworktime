import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";

import { DeviceStatus, fromBase64Url } from "@quanta/shared";

import { EncryptionService } from "../../common/crypto/encryption.service";
import { Device } from "../../entities";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly devices: Repository<Device>,
    private readonly dataSource: DataSource,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Employee registers (or re-registers) their phone. A previous
   * PENDING_APPROVAL registration is replaced; an ACTIVE device stays active
   * until an admin approves the new one.
   */
  async register(
    userId: string,
    deviceKeyB64: string,
    platform: string,
    model: string,
    ip?: string,
  ): Promise<Device> {
    const deviceKey = fromBase64Url(deviceKeyB64);
    const device = await this.dataSource.transaction(async (em) => {
      await em
        .getRepository(Device)
        .delete({ userId, status: DeviceStatus.PENDING_APPROVAL });
      return em.getRepository(Device).save(
        em.getRepository(Device).create({
          userId,
          deviceKeyEncrypted: this.encryption.encrypt(deviceKey),
          platform,
          model,
          status: DeviceStatus.PENDING_APPROVAL,
        }),
      );
    });
    await this.audit.log({
      userId,
      action: "DEVICE_REGISTERED",
      detail: { deviceId: device.id, platform, model },
      ip,
    });
    return device;
  }

  /** Admin approves: new device becomes ACTIVE, any other device of the user is revoked. */
  async approve(deviceId: string, adminId: string): Promise<Device> {
    const device = await this.devices.findOneBy({ id: deviceId });
    if (!device) throw new NotFoundException("Cihaz bulunamadı.");

    await this.dataSource.transaction(async (em) => {
      await em
        .getRepository(Device)
        .createQueryBuilder()
        .update()
        .set({ status: DeviceStatus.REVOKED })
        .where('"userId" = :userId AND id != :id AND status = :active', {
          userId: device.userId,
          id: device.id,
          active: DeviceStatus.ACTIVE,
        })
        .execute();
      await em.getRepository(Device).update(device.id, { status: DeviceStatus.ACTIVE });
    });

    await this.audit.log({
      userId: adminId,
      action: "DEVICE_APPROVED",
      detail: { deviceId, ownerUserId: device.userId },
    });
    return (await this.devices.findOneBy({ id: deviceId }))!;
  }

  async revoke(deviceId: string, adminId: string): Promise<Device> {
    const device = await this.devices.findOneBy({ id: deviceId });
    if (!device) throw new NotFoundException("Cihaz bulunamadı.");
    await this.devices.update(deviceId, { status: DeviceStatus.REVOKED });
    await this.audit.log({
      userId: adminId,
      action: "DEVICE_REVOKED",
      detail: { deviceId, ownerUserId: device.userId },
    });
    return (await this.devices.findOneBy({ id: deviceId }))!;
  }

  async findAll(status?: DeviceStatus): Promise<Device[]> {
    return this.devices.find({
      where: status ? { status } : {},
      relations: { user: true },
      order: { registeredAt: "DESC" },
    });
  }

  async findMine(userId: string): Promise<Device | null> {
    return this.devices.findOne({
      where: { userId },
      order: { registeredAt: "DESC" },
    });
  }

  /** Returns the user's ACTIVE device with the decrypted key, or null. */
  async findActiveWithKey(userId: string): Promise<{ device: Device; key: Uint8Array } | null> {
    const device = await this.devices.findOneBy({ userId, status: DeviceStatus.ACTIVE });
    if (!device) return null;
    return { device, key: this.encryption.decrypt(device.deviceKeyEncrypted) };
  }
}
