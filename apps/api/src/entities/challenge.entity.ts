import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Tablet } from "./tablet.entity";
import { User } from "./user.entity";

@Entity("challenges")
export class Challenge {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column("uuid")
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column("uuid")
  tabletId: string;

  @ManyToOne(() => Tablet, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tabletId" })
  tablet: Tablet;

  /** 16 raw challenge bytes. */
  @Column({ type: "bytea" })
  challenge: Buffer;

  @Column({ type: "timestamptz" })
  expiresAt: Date;

  @Column({ type: "timestamptz", nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
