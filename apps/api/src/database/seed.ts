/**
 * Development seed: 1 admin, 3 employees, 1 tablet, 2 shifts.
 * Run with: pnpm --filter @quanta/api seed
 * Idempotent — skips if the admin user already exists.
 */
import * as argon2 from "argon2";

import { randomBytes, toBase64Url, UserRole } from "@quanta/shared";

import { encryptAes256Gcm } from "../common/crypto/aes";
import { Shift, Tablet, User, UserShift } from "../entities";
import { AppDataSource } from "./data-source";

async function main(): Promise<void> {
  const ds = await AppDataSource.initialize();

  const existing = await ds.getRepository(User).findOneBy({ email: "admin@quanta.local" });
  if (existing) {
    console.log("Seed already applied (admin@quanta.local exists) — nothing to do.");
    await ds.destroy();
    return;
  }

  const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "hex");
  if (encryptionKey.length !== 32) {
    throw new Error("ENCRYPTION_KEY missing/invalid — copy .env.example to .env first.");
  }

  await ds.transaction(async (em) => {
    const users = em.getRepository(User);
    const admin = await users.save(
      users.create({
        email: "admin@quanta.local",
        passwordHash: await argon2.hash("Admin123!"),
        fullName: "Sistem Yöneticisi",
        role: UserRole.ADMIN,
        employeeCode: "QW-0001",
        department: "Yönetim",
      }),
    );

    const employeeData = [
      { email: "ayse.yilmaz@quanta.local", fullName: "Ayşe Yılmaz", code: "QW-1001", dept: "Operasyon" },
      { email: "mehmet.demir@quanta.local", fullName: "Mehmet Demir", code: "QW-1002", dept: "Operasyon" },
      { email: "zeynep.kaya@quanta.local", fullName: "Zeynep Kaya", code: "QW-1003", dept: "Depo" },
    ];
    const employees: User[] = [];
    for (const e of employeeData) {
      employees.push(
        await users.save(
          users.create({
            email: e.email,
            passwordHash: await argon2.hash("Calisan123!"),
            fullName: e.fullName,
            role: UserRole.EMPLOYEE,
            employeeCode: e.code,
            department: e.dept,
          }),
        ),
      );
    }

    const shifts = em.getRepository(Shift);
    const dayShift = await shifts.save(
      shifts.create({
        name: "Gündüz Vardiyası",
        startTime: "09:00",
        endTime: "18:00",
        graceMinutes: 10,
        workDays: 0b0011111, // Mon-Fri
        breakMinutes: 60,
      }),
    );
    const eveningShift = await shifts.save(
      shifts.create({
        name: "Akşam Vardiyası",
        startTime: "14:00",
        endTime: "22:00",
        graceMinutes: 5,
        workDays: 0b0111111, // Mon-Sat
        breakMinutes: 30,
      }),
    );

    const userShifts = em.getRepository(UserShift);
    await userShifts.save([
      userShifts.create({ userId: employees[0].id, shiftId: dayShift.id, effectiveFrom: "2026-01-01" }),
      userShifts.create({ userId: employees[1].id, shiftId: dayShift.id, effectiveFrom: "2026-01-01" }),
      userShifts.create({ userId: employees[2].id, shiftId: eveningShift.id, effectiveFrom: "2026-01-01" }),
    ]);

    const tabletSecret = randomBytes(32);
    const tablets = em.getRepository(Tablet);
    const tablet = await tablets.save(
      tablets.create({
        name: "Ana Giriş Tableti",
        location: "Merkez Ofis — Ana Giriş",
        tabletSecretEncrypted: encryptAes256Gcm(encryptionKey, tabletSecret),
        isActive: true,
      }),
    );

    console.log("Seed completed.");
    console.log("--- Accounts (dev only) ---");
    console.log("  admin@quanta.local / Admin123!  (ADMIN)");
    for (const e of employeeData) console.log(`  ${e.email} / Calisan123!  (EMPLOYEE)`);
    console.log(`--- Tablet ---`);
    console.log(`  id: ${tablet.id}  (${tablet.name})`);
    console.log(`  secret (base64url, dev kiosk provisioning): ${toBase64Url(tabletSecret)}`);
    console.log(`  admin user id: ${admin.id}`);
  });

  await ds.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
