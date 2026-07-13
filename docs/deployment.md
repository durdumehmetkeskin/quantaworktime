# Production Kurulum — Ubuntu/Debian Sunucu

Hedef mimari:

```
İnternet ──HTTPS──▶ Cloudflare (SSL burada) ──HTTP──▶ Host nginx
   quanta.durdumehmetkeskin.space      ──▶ 127.0.0.1:8080 ──▶ [quanta-admin]──/api──▶ [quanta-api]
   quantaapi.durdumehmetkeskin.space   ──▶ 127.0.0.1:3010 ──▶ [quanta-api] ──▶ [quanta-postgres]
                                                                     (postgres: host portu YOK)
```

- API ve admin container'ları **yalnızca 127.0.0.1'e** bağlanır — dışarıdan sadece host nginx üzerinden erişilir.
- PostgreSQL **hiçbir host portu yayınlamaz** (sunucudaki mevcut PostgreSQL ile çakışmaz); yalnızca compose iç ağından erişilir.

## 1. Cloudflare ayarları (bir kez)

1. DNS → iki **A kaydı**, ikisi de **Proxied** (turuncu bulut), değer = sunucu IP'si:
   - `quantaapi` → sunucu IP
   - `quanta` → sunucu IP
2. SSL/TLS → Overview → mod: **Flexible** (origin 80'de dinlediği için hemen çalışır).
   - Daha güvenli **Full (strict)** için: SSL/TLS → Origin Server → Create Certificate → cert/key'i sunucuda `/etc/ssl/cloudflare/` altına koyun ve `deploy/nginx/*.conf` içindeki 443 bloklarını açın, modu Full (strict) yapın.

## 2. Sunucuda kurulum

```bash
# İlk kurulum (repo URL'nizi yazın; docker yoksa script kurar)
REPO_URL=git@github.com:KULLANICI/quanta-worktime-management.git \
  sudo -E bash -c 'git clone "$REPO_URL" /opt/quanta-worktime && bash /opt/quanta-worktime/scripts/deploy.sh --seed'

# Sonraki güncellemeler (git pull + rebuild + nginx reload)
sudo bash /opt/quanta-worktime/scripts/deploy.sh
```

Script idempotenttir:

- `.env` ilk çalıştırmada `openssl rand` ile üretilmiş secret'larla oluşturulur, sonra asla değiştirilmez. **`ENCRYPTION_KEY`'i yedekleyin** — kaybolursa DB'deki şifreli tablet/cihaz anahtarları çözülemez.
- `--seed` yalnızca ilk kurulumda gerekir (idempotent; admin zaten varsa hiçbir şey yapmaz). Seed sonrası `admin@quanta.local / Admin123!` ile girip **şifreyi hemen değiştirin**.
- nginx confleri `/etc/nginx/sites-available/`e kopyalanır (mevcutsa `.bak` yedeği alınır), `nginx -t` doğrulamasından geçmeden reload edilmez.

## 3. Doğrulama

```bash
docker ps                                   # üç container Up olmalı
docker port quanta-postgres                 # ÇIKTI BOŞ olmalı (port kapalı)
curl -s http://127.0.0.1:3010/auth/login -X POST   # 400/401 JSON dönmeli
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080   # 200
curl -s https://quanta.durdumehmetkeskin.space -o /dev/null -w '%{http_code}\n'  # 200 (Cloudflare üzerinden)
```

## 4. İstemciler

- **Admin panel:** https://quanta.durdumehmetkeskin.space
- **Mobil uygulamalar (kiosk provision + employee login) sunucu adresi:**
  `https://quantaapi.durdumehmetkeskin.space`

## 5. İşletme notları

- Loglar: `docker compose -f docker-compose.prod.yml logs -f api`
- Yedek: `docker exec quanta-postgres pg_dump -U quanta quanta_worktime > yedek.sql` (+ `.env` dosyası)
- Puantaj cron'u API container'ında her gece 02:30 (Europe/Istanbul) otomatik çalışır.
- API açılışta bekleyen migration'ları kendisi uygular; ayrı migrate adımı yoktur.
