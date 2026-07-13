import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

import { UserRole } from "@quanta/shared";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column()
  passwordHash: string;

  @Column()
  fullName: string;

  @Column({ type: "enum", enum: UserRole, enumName: "user_role", default: UserRole.EMPLOYEE })
  role: UserRole;

  @Column({ type: "varchar", nullable: true, unique: true })
  employeeCode: string | null;

  @Column({ type: "varchar", nullable: true })
  department: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
