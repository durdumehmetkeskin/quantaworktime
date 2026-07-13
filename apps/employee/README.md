# @quanta/employee — Çalışan Uygulaması (iOS + Android)

Çalışanın telefonunda çalışan React Native uygulaması: QR tarama (react-native-vision-camera), BLE yakınlık kanıtı (react-native-ble-plx), cihaz anahtarı (react-native-keychain) ve offline kuyruk (AsyncStorage).

## Akışlar

- **Login + cihaz kaydı:** İlk girişte 32 baytlık `deviceKey` telefonda üretilir, Keychain/Keystore'a yazılır ve `POST /auth/register-device` ile sunucuya gönderilir (→ `PENDING_APPROVAL`). Uygulama, admin onaylayana kadar "onay bekliyor" ekranında 10 sn'de bir durum sorgular.
- **Giriş/Çıkış:** Büyük buton → kamera → QR → `POST /attendance/challenge` → **BLE adımı** ("Tablet doğrulanıyor…") → `deviceSignature = HMAC(deviceKey, challengeId.bleResponse.clientTs)` → `POST /attendance/check` → başarı/hata ekranı (tümü Türkçe).
- **Geçmişim:** `GET /attendance/me` listesi + `GET /timesheets/me/:month` aylık özet.
- **Offline kuyruk:** `check` isteği ağ hatasıyla düşerse istek AsyncStorage kuyruğuna yazılır ve 30 sn'de bir yeniden denenir. Sunucu geçerliliği **challenge süresine göre** değerlendirir (clientTs'e göre değil) — bu yüzden kuyruklama yalnızca challenge alınabildiyse mümkündür. Challenge alınamazsa kullanıcıya *"Çevrimdışısınız. Bağlantı gelince tablete tekrar okutun."* gösterilir.

## BLE mimarisi

`src/ble/TabletBleClient.ts` bir arayüz tanımlar; iki implementasyon vardır:

- `BlePlxTabletClient` (gerçek): sabit service UUID ile tarar, advertisement'taki 4 baytlık tabletId hash'ini doğrulayarak **doğru tableti** bulur, challenge'ı yazar, response characteristic'i okur, bağlantıyı kapatır.
- `MockTabletBleClient` (geliştirme): fiziksel tablet olmadan aynı byte'ları üretir (seed'in bastığı tablet secret + son okunan QR'ın nonce'u). `src/config.ts` → `USE_MOCK_BLE` ve `MOCK_TABLET_SECRET` ile açılır.

## İzinler

**Android** (`android/app/src/main/AndroidManifest.xml`):

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<!-- Android 12+ -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<!-- Android <= 11 -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
```

Runtime izin akışları kodda hazırdır: kamera `ScanScreen`, BLE `requestBleScanPermissions`.

**iOS** (`ios/QuantaEmployee/Info.plist`):

```xml
<key>NSCameraUsageDescription</key>
<string>Mesai QR kodunu okutmak için kamera gereklidir.</string>
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Tablet doğrulaması için Bluetooth gereklidir.</string>
```

## Çalıştırma

```bash
pnpm install && pnpm --filter @quanta/shared build     # monorepo kökünde
cd apps/employee
npx @react-native-community/cli init QuantaEmployee --version 0.74.5 --directory /tmp/qe  # native shell şablonu
# /tmp/qe/android ve /tmp/qe/ios klasörlerini buraya kopyalayın, sonra:
#  - android manifest'ine yukarıdaki izinleri ekleyin
#  - Info.plist'e yukarıdaki anahtarları ekleyin
#  - app.json name: QuantaEmployee zaten uyumludur
pnpm start          # Metro
pnpm android        # veya: pnpm ios (macOS gerekir)
```

> Bu depo, uygulamanın **tüm TypeScript kaynağını ve konfigürasyonunu** içerir; `android/`
> ve `ios/` klasörleri RN şablonundan üretilir (Windows'ta iOS derlenemediği için depoya konmadı).
> `USE_MOCK_BLE=true` iken uygulama emülatörde fiziksel tablet olmadan uçtan uca test edilebilir.

## Test

- `pnpm --filter @quanta/employee typecheck`
- Uçtan uca senaryolar: `docs/e2e-scenarios.md` (repo kökü).
