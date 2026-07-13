# @quanta/api — NestJS Backend

Mesai takip sisteminin sunucusu: JWT auth, cihaz/tablet yönetimi, 9 adımlı check doğrulama zinciri, puantaj cron'u ve raporlar.

## Çalıştırma

```bash
# repo kökünde
cp .env.example .env          # secret'ları doldurun (openssl rand -hex 32)
pnpm install
pnpm --filter @quanta/shared build
docker compose up -d postgres # PostgreSQL 16 (host portu .env: DB_PORT, varsayılan 5432)
pnpm db:migrate               # TypeORM migration (synchronize: false)
pnpm db:seed                  # 1 admin, 3 çalışan, 1 tablet, 2 vardiya
pnpm api:dev                  # http://localhost:3000
```

Docker ile tam yığın: `docker compose up -d --build` (API imajı `apps/api/Dockerfile`; container açılışta `run-migrations.js` ile bekleyen migration'ları uygular, sonra API'yi başlatır).

## Test

```bash
pnpm --filter @quanta/api test
```

- `attendance-verification.service.spec.ts` — tehdit modelindeki 5 senaryo + happy path + sınır testleri (kripto gerçek, repo katmanı mock).
- `timesheet-calculator.spec.ts` — puantaj hesabı (gece vardiyası, hafta sonu bitmask, grace).

## Mimari Notlar

- **Doğrulama zinciri:** `modules/attendance/attendance-verification.service.ts` — spec §3'teki sıra bire bir; her başarısız adım `audit_logs`'a `ATTENDANCE_CHECK_FAILED` (step + reason) yazar ve 403 döner. Nonce ve challenge tüketimi `UPDATE ... WHERE usedAt IS NULL` ile atomiktir; nonce unique index'i race condition'ı engeller.
- **Secret'lar at-rest şifreli:** `tabletSecret` ve `deviceKey` AES-256-GCM ile (`ENCRYPTION_KEY`) saklanır; HMAC doğrulaması için sunucuda çözülür.
- **Tablet kimliği:** heartbeat / nonce senkronu / son girişler uçları `HMAC(tabletSecret, tabletId.ts)` imzasıyla korunur (±60 sn).
- **Zaman:** DB'de UTC; vardiya/puantaj hesapları Europe/Istanbul (sabit UTC+3) — `modules/attendance/shift-matching.util.ts`.
- **Guard sırası:** Throttler → JWT → Roles (global `APP_GUARD`); attendance uçları 10 istek/dk/kullanıcı.
- **Hatalar:** tüm yanıtlar standart zarf (`AllExceptionsFilter`): `{statusCode, error, message, path, timestamp}` — mesajlar Türkçe.
- Cron: her gece 02:30 (İstanbul) içinde bulunulan ayın puantajını yeniden hesaplar (`TimesheetsService.nightlyGenerate`); onaylı (APPROVED) satırlar atlanır.

## Başlıca Uçlar

| Uç | Açıklama |
|---|---|
| `POST /auth/login`, `/auth/refresh`, `/auth/register-device` | Kimlik + cihaz kaydı |
| `POST /tablets/provision` (admin), `POST /tablets/claim` (kiosk) | Tek kullanımlık kodla tablet kurulumu; secret bir kez döner |
| `POST /tablets/:id/heartbeat`, `/nonces`, `/recent-checkins`, `/rotate-secret` | Tablet yaşam döngüsü |
| `POST /attendance/challenge`, `POST /attendance/check` | Check akışı (9 adımlı doğrulama) |
| `GET /attendance/me`, `GET /attendance`, `PATCH /attendance/:id` | Geçmiş, filtreli liste, manuel düzeltme (isManual + audit) |
| `GET/POST/PATCH/DELETE /shifts`, `POST /shifts/assign` | Vardiya CRUD + atama |
| `GET /timesheets/:month`, `POST /timesheets/:month/generate`, `POST /timesheets/:id/approve` | Puantaj |
| `GET /reports/daily`, `GET /reports/monthly/export` | Günlük rapor + xlsx (exceljs) |
| `GET /audit-logs` | Denetim kaydı (filtreli) |
