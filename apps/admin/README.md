# @quanta/admin — Yönetim Paneli (Vite + React 18)

TanStack Query/Table, react-hook-form + zod ve Tailwind CSS ile yazılmış admin paneli.
Yalnızca ADMIN ve MANAGER rolleri giriş yapabilir.

## Sayfalar

1. **Login** — JWT; access token 401'de otomatik refresh edilir (axios interceptor).
2. **Panel** — bugün içeride/dışarıda/geç kalanlar + son başarısız doğrulama denemeleri; 30 sn'de bir canlı yenilenir (`refetchInterval`).
3. **Çalışanlar** — CRUD, vardiya atama, cihaz onay/iptal (onay bekleyen cihazlar üstte).
4. **Tabletler** — kayıt (tek kullanımlık kurulum kodu modal'ı — kod yalnızca bir kez gösterilir), çevrimiçi durumu (lastSeenAt), secret rotasyonu, aktif/pasif.
5. **Puantaj** — çalışan × gün grid'i; hücreye tıklayınca kayıt düzeltme (not zorunlu, isManual), satır onaylama, Excel indirme, "Yeniden Hesapla".
6. **Kayıtlar** — tüm giriş/çıkışlar (tarih/çalışan/tablet filtresi, sayfalama) + Denetim Kaydı sekmesi.

## Çalıştırma

```bash
pnpm --filter @quanta/admin dev     # http://localhost:5173 (API'ye /api proxy'si, hedef :3000)
pnpm --filter @quanta/admin build   # tsc --noEmit + vite build → dist/
```

Container ile: `docker compose up -d admin` — çok aşamalı imaj (`apps/admin/Dockerfile`) Vite çıktısını
**nginx** ile sunar; `nginx.conf` `/api/` isteklerini compose ağındaki `api` servisine proxy'ler ve
SPA fallback (`try_files ... /index.html`) içerir. Host portu `.env` → `ADMIN_PORT` (varsayılan 5173).

Geliştirme girişleri: `admin@quanta.local / Admin123!` (seed).
