# @quanta/kiosk — Tablet Kiosk Uygulaması (Android)

Girişteki tablette çalışan React Native (bare) uygulaması. 30 saniyede bir imzalı QR üretir, BLE peripheral olarak advertise eder ve GATT server üzerinden challenge-response yanıtlar.

## Akış

1. **Kurulum (bir kez):** Admin panelinden *Tabletler → Tablet Kaydet* ile tek kullanımlık 8 haneli kurulum kodu alınır. Tablette sunucu adresi + kod girilir → `POST /tablets/claim` → 32 baytlık `tabletSecret` **yalnızca bir kez** döner ve Android Keystore'a (react-native-keychain) yazılır.
2. **Ana ekran:** `@quanta/shared`'daki `createQrToken` ile her 30 sn'de yeni QR (payload: `{v, tid, ts, n, sig}`); geri sayım, çevrimiçi/BLE göstergeleri, son başarılı girişler için kısa toast. Ekran `react-native-keep-awake` ile uyanık tutulur.
3. **Nonce yönetimi:** Son 5 nonce RAM'de tutulur (`QrGenerator`); her rotasyonda ve 5 dk'lık heartbeat'te sunucuya senkronlanır (`POST /tablets/:id/nonces`, HMAC imzalı). Tablet offline olsa bile QR üretimi devam eder.
4. **BLE:** Kotlin native modül `BleGattServerModule`:
   - Sabit service UUID (`BLE_SERVICE_UUID`) + service data'da tabletId'nin 4 baytlık SHA-256 kısaltması ile advertise eder.
   - Challenge characteristic'ine yazılan baytlar için `HMAC-SHA256(tabletSecret, base64url(challenge) + "." + currentNonce)` yanıtını **native tarafta** hesaplar (GATT read JS köprüsünü beklemez).
   - Her QR rotasyonunda JS `updateSecretAndNonce` çağırır; QR'daki nonce ile BLE yanıtındaki nonce aynıdır.

## İzinler

- Android 12+ (API 31+): `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT` — runtime izin akışı `src/services/ble.ts` içinde.
- Android ≤ 11: manifest'te legacy `BLUETOOTH`, `BLUETOOTH_ADMIN`, `ACCESS_FINE_LOCATION` (maxSdkVersion=30).

## Çalıştırma

```bash
pnpm install                              # monorepo kökünde
pnpm --filter @quanta/shared build
cd apps/kiosk
pnpm start                                # Metro (monorepo-aware config)
pnpm android                              # Android SDK + cihaz/emülatör gerekir
```

> `android/` klasörü RN 0.74 şablonuna göre elle hazırlanmıştır (debug.keystore içermez).
> İlk derlemeden önce `android/app/debug.keystore` üretin:
> `keytool -genkeypair -v -keystore android/app/debug.keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"`
> Gradle sürüm uyuşmazlığı yaşarsanız `npx @react-native-community/cli init` ile boş bir 0.74 projesi oluşturup `android/` içindeki gradle wrapper'ını kopyalamak en hızlı yoldur; uygulamaya özgü dosyalar (manifest, Kotlin kaynakları, build.gradle ayarları) bu depodakilerdir.

## Test

- `pnpm --filter @quanta/kiosk typecheck` — TS derleme kontrolü.
- Uçtan uca senaryolar: `docs/e2e-scenarios.md` (repo kökü).
- BLE olmadan geliştirme: native modül yoksa uygulama uyarı verir, QR + heartbeat akışı çalışmaya devam eder (mock BLE'li çalışan uygulamasıyla test edilebilir).
