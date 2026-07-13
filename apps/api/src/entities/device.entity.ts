import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { DeviceStatus } from "@quanta/shared";

import { User } from "./user.entity";

/**
 * One ACTIVE device per user is enforced by a partial unique index
 * (see InitialSchema migration: devices_one_active_per_user).
 */
@Entity("devices")
export class Device {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column("uuid")
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /** deviceKey encrypted at rest (AES-256-GCM). Plaintext is needed for HMAC verification. */
  @Column({ type: "text" })
  deviceKeyEncrypted: string;

  @Column()
  platform: string;

  @Column()
  model: string;

  @CreateDateColumn({ type: "timestamptz" })
  registeredAt: Date;

  @Column({
    type: "enum",
    enum: DeviceStatus,
    enumName: "device_status",
    default: DeviceStatus.PENDING_APPROVAL,
  })
  status: DeviceStatus;
}
