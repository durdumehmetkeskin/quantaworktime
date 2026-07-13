import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Shift } from "./shift.entity";
import { User } from "./user.entity";

@Entity("user_shifts")
@Index(["userId", "effectiveFrom"])
export class UserShift {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column("uuid")
  shiftId: string;

  @ManyToOne(() => Shift, { onDelete: "CASCADE" })
  @JoinColumn({ name: "shiftId" })
  shift: Shift;

  @Column({ type: "date" })
  effectiveFrom: string;

  @Column({ type: "date", nullable: true })
  effectiveTo: string | null;
}
