import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { TimesheetStatus } from "@quanta/shared";

import { User } from "./user.entity";

@Entity("timesheets")
@Index(["userId", "periodMonth"], { unique: true })
export class Timesheet {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /** "YYYY-MM". */
  @Column({ type: "varchar", length: 7 })
  periodMonth: string;

  @Column({ type: "int", default: 0 })
  totalWorkedMinutes: number;

  @Column({ type: "int", default: 0 })
  totalLateMinutes: number;

  @Column({ type: "int", default: 0 })
  totalOvertimeMinutes: number;

  @Column({ type: "int", default: 0 })
  totalLeaveMinutes: number;

  @Column({ type: "int", default: 0 })
  absentDays: number;

  @Column({
    type: "enum",
    enum: TimesheetStatus,
    enumName: "timesheet_status",
    default: TimesheetStatus.DRAFT,
  })
  status: TimesheetStatus;

  @Column({ type: "uuid", nullable: true })
  approvedBy: string | null;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
