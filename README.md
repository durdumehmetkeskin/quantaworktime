# Quanta Worktime Management

QR + BLE challenge-response mekanizmalı, sahtekârlığa dayanıklı **Mesai Takip ve Puantaj Sistemi**.
pnpm workspaces monorepo'su: NestJS API, Vite React admin paneli, React Native tablet kiosk'u ve çalışan uygulaması.

```
apps/
├── api/        NestJS 10 + PostgreSQL 16 + TypeORM 0.3 (migration + seed + Jest testleri)
├── admin/      Vite + React 18 + TanStack Query/Table + RHF/zod + Tailwind
├── kiosk/      RN (Android) — dinamik QR + BLE advertise + Kotlin GATT server
└── employee/   RN (iOS+Android) — QR tarama + BLE central + offline kuyruk
packages/
└── shared/     Ortak tipler, sabitler, izomorfik kripto (@noble/hashes)
docs/e2e-scenarios.md   Uçtan uca test senaryoları (tehdit modeli dahil)
```

## Güvenlik Protokolü (özet)

```
┌────────┐  30sn'de bir imzalı QR   ┌─────────┐
│ TABLET │ ───────────────────────▶ │ TELEFON │  QR: {v, tid, ts, nonce, HMAC(tabletSecret, tid.ts.n)}
│ (kiosk)│ ◀── BLE: challenge ───── │(çalışan)│
│        │ ──── BLE: response ────▶ │         │  response = HMAC(tabletSecret, challenge.nonce)
└────────┘                          └────┬────┘
                                         │ check: qr + challengeId + bleResponse
                                         │        + HMAC(deviceKey, challengeId.bleResponse.ts)
                                    ┌────▼────┐
                                    │   API   │  9 adımlı doğrulama; her ret → audit log + 403
                                    └─────────┘
```

Engellenen saldırılar (unit testlerle kanıtlı — `attendance-verification.service.spec.ts`):
QR fotoğrafını uzağa gönderme (BLE kanıtı yok) · QR replay (tek kullanımlık nonce + ±60 sn) ·
başka telefondan giriş (device binding) · challenge tekrar kullanımı · sahte tablet (paylaşımlı secret).

## Hızlı Başlangıç (tam yığın, container)

```bash
cp .env.example .env          # secret'ları doldurun: openssl rand -hex 32
docker compose up -d --build  # postgres + api + admin (api açılışta migration uygular)
pnpm install && pnpm db:seed  # seed: admin + 3 çalışan + 1 tablet + 2 vardiya (bir kez)
# API   → http://localhost:3000
# Panel → http://localhost:5173  (nginx, /api'yi api container'ına proxy'ler)
```

### Geliştirme modu (hot reload)

```bash
docker compose up -d postgres
pnpm install && pnpm --filter @quanta/shared build
pnpm db:migrate && pnpm db:seed
pnpm api:dev                        # API   → http://localhost:3000
pnpm admin:dev                      # Panel → http://localhost:5173 (Vite)
```

Seed hesapları: `admin@quanta.local / Admin123!` · `ayse.yilmaz@quanta.local / Calisan123!`

## Test

```bash
pnpm --filter @quanta/api test          # 24 test: tehdit modeli + puantaj hesabı
pnpm --filter @quanta/kiosk typecheck
pnpm --filter @quanta/employee typecheck
```

Mobil uygulamaların cihazla test senaryoları için: [`docs/e2e-scenarios.md`](docs/e2e-scenarios.md).
Her paketin kendi README'sinde çalıştırma/test detayları vardır.

## Genel Kurallar

- Tüm secret'lar `.env`'den; kripto tek yerde: `packages/shared/src/crypto.ts` (timing-safe karşılaştırma dahil).
- `tabletSecret` ve `deviceKey` DB'de AES-256-GCM ile şifreli (at rest).
- Tarih/saat: DB'de UTC, gösterim Europe/Istanbul.
- Kod dili İngilizce, kullanıcıya görünen tüm metinler Türkçe.
