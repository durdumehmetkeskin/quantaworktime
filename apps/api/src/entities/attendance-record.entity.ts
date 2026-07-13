import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { AttendanceType } from "@quanta/shared";

import { Tablet } from "./tablet.entity";
import { User } from "./user.entity";

@Entity("attendance_records")
@Index(["userId", "timestamp"])
export class AttendanceRecord {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /** Null for manual (admin-corrected) records. */
  @Column({ type: "uuid", nullable: true })
  tabletId: string | null;

  @ManyToOne(() => Tablet, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "tabletId" })
  tablet: Tablet | null;

  @Column({ type: "enum", enum: AttendanceType, enumName: "attendance_type" })
  type: AttendanceType;

  @Index()
  @Column({ type: "timestamptz" })
  timestamp: Date;

  @Column({ type: "uuid", nullable: true })
  challengeId: string | null;

  @Column({ type: "int", default: 0 })
  lateMinutes: number;

  @Column({ type: "int", default: 0 })
  earlyLeaveMinutes: number;

  @Column({ default: false })
  isManual: boolean;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
