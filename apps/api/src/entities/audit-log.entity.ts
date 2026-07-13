import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Immutable audit trail. Every FAILED verification attempt in the attendance
 * chain lands here (spec §3), along with security-relevant admin actions.
 */
@Entity("audit_logs")
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  userId: string | null;

  @Index()
  @Column()
  action: string;

  @Column({ type: "jsonb", default: {} })
  detail: Record<string, unknown>;

  @Column({ type: "varchar", nullable: true })
  ip: string | null;

  @Index()
  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
