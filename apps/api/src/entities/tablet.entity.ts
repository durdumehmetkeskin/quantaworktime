import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("tablets")
export class Tablet {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column()
  location: string;

  /**
   * tabletSecret encrypted at rest (AES-256-GCM). Null until the kiosk claims
   * its provision code. Rotation issues a new provision code; the secret is
   * replaced when the kiosk re-claims.
   */
  @Column({ type: "text", nullable: true })
  tabletSecretEncrypted: string | null;

  /** SHA-256 hex of the one-time provision code (never stored in plaintext). */
  @Index({ unique: true })
  @Column({ type: "varchar", nullable: true })
  provisionCodeHash: string | null;

  @Column({ type: "timestamptz", nullable: true })
  provisionCodeExpiresAt: Date | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: "timestamptz", nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
