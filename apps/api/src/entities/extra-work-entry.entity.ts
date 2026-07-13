import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { ExtraWorkStatus } from "@quanta/shared";

import { User } from "./user.entity";

/**
 * Work detected outside the employee's scheduled hours (beyond shift end on a
 * workday, or any work on an off day). Created/refreshed by timesheet
 * generation with status PENDING; an admin classifies it as OVERTIME or
 * MAKEUP. Only OVERTIME minutes flow into the timesheet's overtime total.
 */
@Entity("extra_work_entries")
@Index(["userId", "workDate"], { unique: true })
export class ExtraWorkEntry {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /** Istanbul calendar day, "YYYY-MM-DD". */
  @Column({ type: "date" })
  workDate: string;

  @Column({ type: "int" })
  minutes: number;

  @Column({
    type: "enum",
    enum: ExtraWorkStatus,
    enumName: "extra_work_status",
    default: ExtraWorkStatus.PENDING,
  })
  status: ExtraWorkStatus;

  @Column({ type: "uuid", nullable: true })
  decidedBy: string | null;

  @Column({ type: "timestamptz", nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
