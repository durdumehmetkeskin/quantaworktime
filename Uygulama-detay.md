# CLAUDE CODE PROMPTU — BLE Doğrulamalı Mesai Takip ve Puantaj Sistemi

Aşağıdaki metnin tamamını Claude Code'a tek seferde verebilirsin. Büyük bir proje olduğu için Claude Code'a "Faz 1'den başla, her fazı bitirince bana özet ver" diyerek fazlar halinde ilerletmen önerilir.

---

QR + BLE challenge-response mekanizmalı, sahtekârlığa dayanıklı bir **Mesai Takip ve Puantaj Sistemi** geliştir. Monorepo yapısı kullan (pnpm workspaces).

## Teknoloji Yığını (kesin, değiştirme)

- **Backend:** NestJS (v10+), PostgreSQL 16, TypeORM (v0.3, DataSource API), class-validator, @nestjs/jwt, @nestjs/schedule, @nestjs/throttler
- **Admin Panel:** Vite + React 18 + TypeScript, TanStack Query, TanStack Table, react-hook-form + zod, Tailwind CSS
- **Tablet Kiosk Uygulaması:** React Native (bare workflow, Android hedefli), react-native-qrcode-svg, BLE advertising + GATT server için react-native-ble-advertiser ve gerekirse küçük bir native Android modülü (Kotlin) — GATT server kısmını native module olarak yaz
- **Çalışan Mobil Uygulaması:** React Native (iOS + Android), react-native-vision-camera (QR tarama), react-native-ble-plx (BLE central), react-native-keychain (device key saklama), @react-native-async-storage/async-storage (offline kuyruk)
- **Ortak paket:** `packages/shared` — DTO tipleri, HMAC/kripto yardımcıları, sabitler (her iki RN uygulaması ve backend paylaşır)

## Monorepo Yapısı

```
attendance-system/
├── apps/
│   ├── api/            # NestJS backend
│   ├── admin/          # Vite React admin paneli
│   ├── kiosk/          # React Native tablet uygulaması
│   └── employee/       # React Native çalışan uygulaması
├── packages/
│   └── shared/         # ortak tipler, kripto yardımcıları
├── docker-compose.yml  # PostgreSQL + API
└── pnpm-workspace.yaml
```

## Sistem Mimarisi ve Güvenlik Protokolü

### 1. Dinamik QR üretimi (tablet tarafı)

- Her tablet kayıt sırasında sunucudan 32 byte `tabletSecret` alır ve güvenli depoda saklar.
- Tablet her 30 saniyede bir QR payload üretir:
  ```json
  {
    "v": 1,
    "tid": "<tabletId>",
    "ts": <unixEpochSeconds>,
    "n": "<16 byte random nonce, base64url>",
    "sig": "HMAC-SHA256(tabletSecret, tid + '.' + ts + '.' + n) base64url"
  }
  ```
- QR, bu JSON'un base64url halidir. Tablet offline olsa bile üretmeye devam eder.
- Tablet, ürettiği son 5 nonce'u RAM'de tutar (BLE doğrulamasında kullanacak).

### 2. BLE challenge-response (yakınlık kanıtı)

- Tablet, BLE peripheral olarak sabit bir Service UUID ile advertise eder. Advertisement payload'ında `tabletId`'nin kısa hash'i bulunur (telefonun doğru tableti bulması için).
- Telefon QR'ı okuduktan sonra:
  1. Sunucudan `POST /attendance/challenge` ile tek kullanımlık `challenge` (16 byte) alır. Sunucu challenge'ı `{ userId, tabletId, expiresAt: +45sn }` ile DB'ye yazar.
  2. BLE ile tablete bağlanır, GATT characteristic'e `challenge`'ı yazar.
  3. Tablet `response = HMAC-SHA256(tabletSecret, challenge + '.' + currentNonce)` hesaplar ve read characteristic'ten döner.
  4. Telefon bağlantıyı kapatır.
- Bu response sadece tabletSecret'ı bilen VE fiziksel BLE menzilinde olan bir cihaz tarafından elde edilebilir.

### 3. Check-in isteği ve sunucu doğrulaması

`POST /attendance/check` body:
```json
{
  "qrPayload": "<base64url QR içeriği>",
  "challengeId": "<uuid>",
  "bleResponse": "<base64url>",
  "type": "IN" | "OUT",
  "deviceSignature": "HMAC-SHA256(deviceKey, challengeId + '.' + bleResponse + '.' + ts)",
  "clientTs": <unixEpochSeconds>
}
```

Sunucu sırasıyla doğrular (herhangi biri başarısızsa 403 + audit log):
1. JWT geçerli, kullanıcı aktif.
2. İsteği atan cihaz, kullanıcının kayıtlı cihazı (deviceSignature doğrulaması, deviceKey DB'de hash'li değil — HMAC için düz saklanır ama at-rest şifrelenir).
3. QR imzası geçerli: `HMAC(tabletSecret, ...)` eşleşiyor.
4. QR `ts` değeri şimdiden en fazla ±60 sn sapıyor.
5. QR `nonce` daha önce kullanılmamış → kullanıldı olarak işaretle (unique constraint ile race condition'a dayanıklı).
6. `challengeId` bu kullanıcıya ait, süresi geçmemiş, kullanılmamış.
7. `bleResponse` doğru: sunucu, tabletin son geçerli nonce'ları üzerinden `HMAC(tabletSecret, challenge + '.' + nonce)` hesaplayıp karşılaştırır (tabletin ürettiği nonce'lar QR doğrulamasından zaten sunucuda biliniyor — son 5 pencereyi dene).
8. Aynı kullanıcı için son 60 sn içinde mükerrer kayıt yok (idempotency).
9. Hepsi geçerse `attendance_records`'a kayıt at, vardiyayla eşleştir, geç kalma/erken çıkma hesapla.

### 4. Tehdit modeli — bu senaryolar ENGELLENMELİ ve testlerle kanıtlanmalı

- QR fotoğrafının uzaktaki birine gönderilmesi → BLE kanıtı olmadığı için reddedilir.
- Eski QR'ın tekrar kullanılması (replay) → nonce tek kullanımlık + zaman penceresi.
- Başka çalışanın telefonundan giriş → device binding + deviceSignature.
- Challenge'ın başka check-in'de tekrar kullanılması → challenge tek kullanımlık.
- Sahte tablet → tabletSecret sunucuyla paylaşımlı, sahte tablet geçerli HMAC üretemez.

## Veritabanı Şeması (TypeORM entity'leri)

- **users**: id (uuid), email, passwordHash (argon2), fullName, role (ADMIN | MANAGER | EMPLOYEE), employeeCode, department, isActive, createdAt
- **devices**: id, userId (FK, unique — bir kullanıcı bir aktif cihaz), deviceKey (encrypted), platform, model, registeredAt, status (ACTIVE | PENDING_APPROVAL | REVOKED)
- **tablets**: id, name, location, tabletSecret (encrypted at rest), isActive, lastSeenAt
- **qr_nonces**: id, tabletId (FK), nonce (unique index), issuedTs, usedAt (nullable), usedByUserId (nullable)
- **challenges**: id (uuid), userId, tabletId, challenge (bytes), expiresAt, usedAt (nullable)
- **attendance_records**: id, userId, tabletId, type (IN | OUT), timestamp, challengeId, lateMinutes, earlyLeaveMinutes, isManual (admin düzeltmesi), note
- **shifts**: id, name, startTime, endTime, graceMinutes, workDays (int[] bitmask), breakMinutes
- **user_shifts**: userId, shiftId, effectiveFrom, effectiveTo
- **timesheets**: id, userId, periodMonth, totalWorkedMinutes, totalLateMinutes, totalOvertimeMinutes, absentDays, status (DRAFT | APPROVED), approvedBy
- **audit_logs**: id, userId, action, detail (jsonb), ip, createdAt — özellikle BAŞARISIZ doğrulama denemeleri buraya yazılır

Migration'ları TypeORM migration olarak yaz (synchronize: false), seed script ekle (1 admin, 3 çalışan, 1 tablet, 2 vardiya).

## Backend API Yüzeyi

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/register-device` (çalışan ilk girişte cihaz kaydeder → PENDING_APPROVAL, admin onaylar)
- `POST /tablets/provision` (admin: tablet kaydı, secret üretimi — secret yalnızca bir kez gösterilir)
- `POST /tablets/:id/heartbeat` (tablet 5 dk'da bir; ayrıca ürettiği nonce listesini senkronlar: `POST /tablets/:id/nonces`)
- `POST /attendance/challenge`, `POST /attendance/check`
- `GET /attendance/me` (çalışan kendi geçmişi), `GET /attendance` (admin, filtreli/sayfalı)
- `PATCH /attendance/:id` (admin manuel düzeltme → isManual=true + audit log)
- `GET /timesheets/:month`, `POST /timesheets/:month/generate` (cron: her gece puantaj hesapla, @nestjs/schedule), `POST /timesheets/:id/approve`
- `GET /reports/daily`, `GET /reports/monthly/export` (xlsx — exceljs)
- CRUD: users, shifts, devices (approve/revoke)
- Global: ValidationPipe (whitelist), ThrottlerGuard (attendance uçlarında 10 istek/dk/kullanıcı), tüm hatalar standart hata zarfıyla

## Admin Panel (Vite React) Sayfaları

1. Login
2. Dashboard: bugün içeride/dışarıda olanlar, geç kalanlar, son başarısız doğrulama denemeleri (canlı, 30 sn polling)
3. Çalışanlar: CRUD + vardiya atama + cihaz onay/iptal
4. Tabletler: kayıt, konum, çevrimiçi durumu, secret rotasyonu
5. Puantaj: aylık tablo (çalışan x gün grid), hücre bazlı düzeltme, onaylama, Excel indirme
6. Kayıtlar: tüm giriş/çıkışlar, filtre (tarih, çalışan, tablet), audit log görünümü

## Tablet Kiosk Uygulaması Ekranları

- Provision ekranı (bir kez: sunucu URL + provision kodu gir → secret al, keychain'e yaz)
- Ana ekran: büyük QR (30 sn sayaç ile), tablet adı/konumu, çevrimiçi/çevrimdışı göstergesi, son 5 başarılı girişin adı-soyadı (kısa toast)
- BLE advertising ve GATT server arka planda sürekli açık; ekran uyanık tutulur (keep awake)

## Çalışan Uygulaması Ekranları

- Login + cihaz kaydı (onay bekliyor ekranı dahil)
- Ana ekran: "Giriş Yap / Çıkış Yap" büyük buton → kamera açılır → QR okunur → BLE adımı (progress göstergesi: "Tablet doğrulanıyor...") → başarı/hata ekranı
- Geçmişim: kendi giriş/çıkış listesi, aylık özet (toplam çalışma, geç kalma)
- Offline kuyruk: istek atılamazsa AsyncStorage'a yazılır, bağlantı gelince otomatik gönderilir (ancak sunucu zaman penceresini clientTs'e değil, challenge süresine göre değerlendirir — offline check-in yalnızca challenge alınabildiyse mümkündür; alınamadıysa kullanıcıya "çevrimdışı, tablete daha sonra tekrar okutun" uyarısı göster)

## Uygulama Fazları (bu sırayla ilerle, her fazda çalışır durumda bırak)

- **Faz 1:** Monorepo iskeleti, docker-compose (PostgreSQL), shared paket, NestJS auth + users + devices + tablets modülleri, migration + seed.
- **Faz 2:** QR/nonce/challenge/attendance modülleri + tüm doğrulama zinciri. Bu fazda doğrulama mantığı için kapsamlı unit test (Jest) yaz: tehdit modelindeki 5 senaryonun her biri için başarısızlık testi + happy path.
- **Faz 3:** Vardiya, puantaj hesaplama cron'u, raporlar, xlsx export.
- **Faz 4:** Admin paneli (tüm sayfalar).
- **Faz 5:** Tablet kiosk uygulaması (önce QR + heartbeat, sonra BLE native modül).
- **Faz 6:** Çalışan uygulaması (önce QR tarama + check akışı mock BLE ile, sonra gerçek react-native-ble-plx entegrasyonu), e2e senaryo dökümanı.

## Genel Kurallar

- Tüm secret'lar env'den (`.env.example` oluştur), kripto işlemleri `packages/shared/crypto.ts`'te tek yerde.
- Timing-safe karşılaştırma kullan (`crypto.timingSafeEqual`).
- Tarih/saat: DB'de UTC, gösterimde Europe/Istanbul.
- Her modülde README: nasıl çalıştırılır, test edilir.
- BLE izin akışlarını (Android 12+ BLUETOOTH_SCAN/CONNECT/ADVERTISE, iOS NSBluetoothAlwaysUsageDescription) eksiksiz ekle.
- Kod dili İngilizce, kullanıcıya görünen tüm metinler Türkçe.
