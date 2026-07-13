import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * workDays is a bitmask: bit 0 = Monday ... bit 6 = Sunday.
 * e.g. Mon-Fri = 0b0011111 = 31.
 */
@Entity("shifts")
export class Shift {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  /** "HH:MM" local (Europe/Istanbul) start of shift. */
  @Column({ type: "time" })
  startTime: string;

  /** "HH:MM" local end; may be earlier than startTime for overnight shifts. */
  @Column({ type: "time" })
  endTime: string;

  @Column({ type: "int", default: 0 })
  graceMinutes: number;

  @Column({ type: "int", default: 31 })
  workDays: number;

  @Column({ type: "int", default: 60 })
  breakMinutes: number;
}
