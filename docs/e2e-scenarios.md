# Uçtan Uca Test Senaryoları — Quanta Worktime Management

Bu doküman, sistemin gerçek cihazlarla (1 Android tablet + 1 telefon) ve/veya mock BLE ile
doğrulanması için adım adım senaryoları içerir. Otomatik karşılıkları:
`apps/api/src/modules/attendance/attendance-verification.service.spec.ts` (14 unit test).

## 0. Ortam Hazırlığı

1. `cp .env.example .env` → `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` doldurun (`openssl rand -hex 32`).
2. `pnpm install && pnpm --filter @quanta/shared build`
3. `docker compose up -d postgres` → `pnpm db:migrate` → `pnpm db:seed`
   - Seed çıktısındaki **tablet secret**'ı not alın (mock BLE için gerekli).
4. `pnpm api:dev` (API :3000) ve `pnpm admin:dev` (panel :5173).
5. Hesaplar: `admin@quanta.local / Admin123!`, `ayse.yilmaz@quanta.local / Calisan123!` (+2 çalışan).

## 1. Kurulum Senaryoları

### 1.1 Tablet kurulumu (kiosk)
1. Admin panel → Tabletler → **Tablet Kaydet** → ad/konum gir → 8 haneli kurulum kodu görüntülenir (yalnızca bir kez).
2. Kiosk uygulamasında sunucu adresi + kodu girin.
3. **Beklenen:** Kiosk ana ekranı açılır; QR 30 sn'de bir döner; panelde tablet 10 dk içinde "Çevrimiçi" görünür; kod ikinci kez kullanılınca `403 Kurulum kodu geçersiz`.

### 1.2 Çalışan cihaz kaydı
1. Çalışan uygulamasında giriş yapın → "Bu Cihazı Kaydet".
2. **Beklenen:** "Yönetici onayı bekleniyor" ekranı; panel → Çalışanlar'da onay kartı belirir.
3. Admin **Onayla** der → telefon 10 sn içinde ana ekrana geçer.
4. Admin **Reddet/iptal** derse cihaz REVOKED olur; check denemesi 403 döner (bkz. 3.3).

## 2. Mutlu Yol (Happy Path)

1. Telefonda **Giriş Yap** → kamera açılır → tabletteki QR okutulur.
2. "Tablet doğrulanıyor…" adımı (BLE) ~1-2 sn sürer.
3. **Beklenen:**
   - Telefonda "Giriş kaydedildi. İyi çalışmalar!" (geç kalındıysa "(X dk geç)").
   - Tablette birkaç saniye içinde "✅ Hoş geldiniz, Ayşe Yılmaz" toast'ı.
   - Panel → Panel sayfasında çalışan "İçeride"; Kayıtlar'da yeni satır.
4. Aynı akışla **Çıkış Yap** → "Çıkış kaydedildi" + erken çıkış hesaplanır.
5. 60 sn içinde ikinci deneme → 403 (mükerrer kayıt penceresi).

## 3. Tehdit Modeli Senaryoları (hepsi REDDEDİLMELİ)

Her başarısız denemede: telefonda Türkçe hata; panel → Panel → "Son Başarısız Doğrulama
Denemeleri"nde `step` + `reason` ile kayıt; `audit_logs` tablosunda `ATTENDANCE_CHECK_FAILED`.

### 3.1 QR fotoğrafının uzağa gönderilmesi (BLE kanıtı yok) → step 7
1. Tabletteki QR'ın fotoğrafını çekip **BLE menzili dışındaki** bir telefona gönderin.
2. Uzak telefonda (kayıtlı cihazıyla) QR'ı okutun.
3. **Beklenen:** BLE taraması tableti bulamaz ("Tablet yakınında bulunamadı") — istek sunucuya
   hiç gitmez. Sahte `bleResponse` ile istek zorlanırsa sunucu step 7 `ble_response_invalid` ile 403 döner.

### 3.2 Eski QR'ın tekrar kullanılması (replay) → step 4/5
1. Bir QR'ı okutup başarılı check yapın; aynı QR payload'ını (ör. proxy'den kopyalayıp) tekrar gönderin.
2. **Beklenen:** nonce işaretlendiği için step 5 `nonce_replayed`; 60 sn'den eski QR için step 4 `qr_expired`.

### 3.3 Başka çalışanın telefonundan giriş → step 2
1. A kullanıcısının hesabıyla, B'nin telefonundan (B'nin deviceKey'i) check deneyin
   (veya cihazı REVOKED yapıp aynı telefondan deneyin).
2. **Beklenen:** step 2 `device_signature_mismatch` / `no_active_device` → 403.

### 3.4 Challenge'ın tekrar kullanılması → step 6
1. Geçerli bir check yapın; aynı `challengeId` + `bleResponse` ile ikinci istek gönderin.
2. **Beklenen:** step 6 `challenge_expired_or_used` → 403. 45 sn bekletilen challenge da aynı şekilde reddedilir.

### 3.5 Sahte tablet → step 3
1. Farklı bir secret ile QR üreten sahte kiosk kurun (`createQrToken` + rastgele secret).
2. **Beklenen:** step 3 `qr_signature_invalid` → 403. Sahte tabletin BLE yanıtı da (step 7) geçersizdir.

## 4. Offline Senaryolar

### 4.1 Challenge alınamadan offline
1. Telefonun interneti kapalıyken QR okutun.
2. **Beklenen:** "Çevrimdışısınız. Bağlantı gelince tablete tekrar okutun." — kuyruğa YAZILMAZ
   (challenge yoksa offline check-in mümkün değildir; sunucu challenge süresine göre değerlendirir).

### 4.2 Challenge alındıktan sonra offline
1. QR okutup BLE adımı bittikten hemen sonra (check gönderilmeden) interneti kesin.
2. **Beklenen:** "Kayıt kuyruğa alındı" ekranı; internet gelince 30 sn içinde otomatik gönderim.
   Challenge süresi (45 sn) aşıldıysa sunucu 403 döner, kayıt kuyruktan düşürülür ve ana ekranda
   "zaman aşımına uğradı, tekrar okutun" uyarısı görünür.

### 4.3 Tablet offline
1. Tabletin internetini kesin; QR üretiminin devam ettiğini doğrulayın (spec §1).
2. Telefon online iken QR okutun. **Beklenen:** check yine BAŞARILI olur — sunucu QR imzasını
   kendisi doğrular ve nonce'u ilk kez o anda kaydeder; BLE yanıtı QR'daki nonce ile doğrulanır.
3. Tablet tekrar online olunca nonce'ları senkronlar; panelde "Çevrimiçi" olur.

## 5. Puantaj ve Raporlar

1. Bir çalışana vardiya atayın (Çalışanlar → Vardiya), birkaç gün giriş/çıkış üretin.
2. Puantaj sayfası → ay seçin → **Yeniden Hesapla**. Grid'de gün hücrelerini, toplam/geç/fazla
   mesai/devamsızlık kolonlarını doğrulayın (cron her gece 02:30 İstanbul'da aynı hesabı yapar).
3. Bir hücreye tıklayıp saat düzeltin (not zorunlu) → kayıt "Manuel" işaretlenir + audit'e düşer.
4. **Onayla** → satır APPROVED olur; sonraki yeniden hesaplamalar onaylı satırı atlar.
5. **Excel İndir** → `puantaj-YYYY-AA.xlsx` iki sayfa içerir (Özet + Kayıtlar).

## 6. Bilinen Sınırlamalar

- Gece yarısını aşan vardiyada IN ve OUT farklı günlere düştüğü için o günün "çalışılan dakika"
  hesabı 0 kalır (kayıtlı davranış — `timesheet-calculator.spec.ts`); toplamlar admin düzeltmesiyle
  yönetilir.
- Geliştirme ortamı Windows olduğundan `android/`/`ios/` derlemeleri bu depoda doğrulanmadı
  (Android SDK yok); RN uygulamaları TypeScript + mock BLE düzeyinde test edildi.
