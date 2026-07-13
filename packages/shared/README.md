# @quanta/shared

Ortak tipler, sabitler ve **izomorfik kripto yardımcıları**. Backend (NestJS), tablet kiosk ve çalışan uygulaması (React Native) tarafından paylaşılır.

## İçerik

- `crypto.ts` — HMAC-SHA256, base64url, timing-safe karşılaştırma, QR token üretme/çözme, BLE response ve deviceSignature hesaplama. Tüm imzalanan mesajların kanonik tanımı **yalnızca** buradadır (`buildQrSignatureMessage`, `buildBleResponseMessage`, `buildDeviceSignatureMessage`, `buildTabletAuthMessage`).
- `constants.ts` — süre pencereleri (QR 30 sn, challenge 45 sn, ±60 sn skew...), BLE service/characteristic UUID'leri, byte boyutları.
- `types.ts` — enum'lar, QR payload tipi, API istek/yanıt sözleşmeleri.

## Neden @noble/hashes?

React Native'de `node:crypto` yoktur. `@noble/hashes` saf JS olduğundan aynı kod Node ve RN'de bit-uyumlu çalışır.

> **RN notu:** `randomBytes` CSPRNG olarak `crypto.getRandomValues` kullanır. RN uygulamaları entry point'lerinde bir kez `import 'react-native-get-random-values'` yapmalıdır.

## Çalıştırma

```bash
pnpm --filter @quanta/shared build   # dist/ üretir (CJS + .d.ts)
```

Testler `@quanta/api` unit testleri içinde dolaylı olarak kapsanır (doğrulama zinciri gerçek kripto ile test edilir).
