import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "./user.entity";

/**
 * Admin-entered leave (izin) for a specific day. startTime/endTime null means
 * a full-day leave. Leave hours count into the timesheet's leave total, never
 * as absence, and forgive late/early-leave minutes they overlap.
 */
@Entity("leave_entries")
@Index(["userId", "leaveDate"])
export class LeaveEntry {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /** Istanbul calendar day, "YYYY-MM-DD". */
  @Column({ type: "date" })
  leaveDate: string;

  /** "HH:MM" local; null together with endTime = full-day leave. */
  @Column({ type: "time", nullable: true })
  startTime: string | null;

  @Column({ type: "time", nullable: true })
  endTime: string | null;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @Column({ type: "uuid" })
  createdBy: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
