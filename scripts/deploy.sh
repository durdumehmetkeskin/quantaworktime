#!/usr/bin/env bash
# Quanta Worktime Management — production deploy script (Ubuntu/Debian).
#
# First install:   sudo bash scripts/deploy.sh --seed
# Update deploy:   sudo bash scripts/deploy.sh
#
# What it does (idempotent):
#   1. Installs docker + compose plugin if missing.
#   2. Clones/pulls the repo into $APP_DIR.
#   3. Creates .env with random secrets on first run (never overwrites).
#   4. Builds & starts docker-compose.prod.yml (postgres has NO host port;
#      api/admin bind to 127.0.0.1 only).
#   5. Optionally seeds the database (--seed).
#   6. Installs host-nginx site configs for the two domains and reloads nginx.
set -euo pipefail

# ------------------------------------------------------------------ settings
REPO_URL="${REPO_URL:-}"              # e.g. git@github.com:user/quanta-worktime-management.git
APP_DIR="${APP_DIR:-/opt/quanta-worktime}"
COMPOSE_FILE="docker-compose.prod.yml"
API_DOMAIN="quantaapi.durdumehmetkeskin.space"
ADMIN_DOMAIN="quanta.durdumehmetkeskin.space"

SEED=false
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    *) echo "Bilinmeyen argüman: $arg (desteklenen: --seed)"; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "HATA: Bu script root olarak çalıştırılmalı: sudo bash scripts/deploy.sh"
  exit 1
fi

# ------------------------------------------------------ 1) docker kurulumu
if ! command -v docker >/dev/null 2>&1; then
  echo ">> Docker kuruluyor..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg git
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi
docker compose version >/dev/null 2>&1 || { echo "HATA: docker compose plugin yok."; exit 1; }

# --------------------------------------------------------- 2) kod aktarımı
if [[ -d "$APP_DIR/.git" ]]; then
  echo ">> Depo güncelleniyor: $APP_DIR"
  git -C "$APP_DIR" pull --ff-only
elif [[ -f "$APP_DIR/$COMPOSE_FILE" ]]; then
  echo ">> $APP_DIR mevcut (git deposu değil) — kod güncellemesi atlandı."
else
  if [[ -z "$REPO_URL" ]]; then
    # Script bir çalışma kopyasının içinden mi çalıştırılıyor?
    SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    if [[ -f "$SCRIPT_ROOT/$COMPOSE_FILE" ]]; then
      APP_DIR="$SCRIPT_ROOT"
      echo ">> Mevcut çalışma kopyası kullanılıyor: $APP_DIR"
    else
      echo "HATA: REPO_URL verin: REPO_URL=git@github.com:kullanici/repo.git sudo -E bash scripts/deploy.sh"
      exit 1
    fi
  else
    echo ">> Depo klonlanıyor: $REPO_URL -> $APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
  fi
fi
cd "$APP_DIR"

# ------------------------------------------------------------- 3) .env üret
if [[ ! -f .env ]]; then
  echo ">> .env oluşturuluyor (rastgele secret'larla)..."
  cp .env.example .env
  sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -hex 32)|" .env
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" .env
  chmod 600 .env
  echo "   .env hazır (chmod 600). ENCRYPTION_KEY'i yedekleyin — kaybolursa"
  echo "   şifreli tablet/cihaz anahtarları çözülemez!"
else
  echo ">> Mevcut .env korunuyor."
fi

# ------------------------------------------------------ 4) container'ları aç
echo ">> Container'lar derlenip başlatılıyor..."
docker compose -f "$COMPOSE_FILE" up -d --build

echo ">> API'nin ayağa kalkması bekleniyor..."
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T api node -e \
    "fetch('http://localhost:3000/auth/login',{method:'POST'}).then(r=>process.exit(0)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1; then
    echo "   API hazır."
    break
  fi
  [[ $i -eq 30 ]] && { echo "HATA: API 60 sn içinde açılmadı. docker compose logs api"; exit 1; }
  sleep 2
done

# ----------------------------------------------------------------- 5) seed
if $SEED; then
  echo ">> Seed çalıştırılıyor (idempotent)..."
  docker compose -f "$COMPOSE_FILE" exec -T api node dist/database/seed.js
fi

# ------------------------------------------------------------ 6) host nginx
echo ">> Host nginx site konfigleri kuruluyor..."
for conf in quanta-api.conf quanta-admin.conf; do
  target="/etc/nginx/sites-available/$conf"
  if [[ -f "$target" ]] && ! cmp -s "deploy/nginx/$conf" "$target"; then
    cp "$target" "$target.bak.$(date +%s)"
    echo "   Mevcut $conf yedeklendi (.bak)."
  fi
  cp "deploy/nginx/$conf" "$target"
  ln -sf "$target" "/etc/nginx/sites-enabled/$conf"
done
nginx -t
systemctl reload nginx

# ---------------------------------------------------------------- 7) özet
API_PORT="$(grep -oP '^API_BIND_PORT=\K.*' .env 2>/dev/null || echo 3010)"
ADMIN_PORT="$(grep -oP '^ADMIN_BIND_PORT=\K.*' .env 2>/dev/null || echo 8080)"
echo
echo "================= KURULUM TAMAM ================="
echo "  Admin panel : https://$ADMIN_DOMAIN  (-> 127.0.0.1:$ADMIN_PORT)"
echo "  API         : https://$API_DOMAIN  (-> 127.0.0.1:$API_PORT)"
echo "  PostgreSQL  : host portu YOK (yalnızca docker iç ağı)"
echo
echo "  Cloudflare: iki subdomain de A kaydı + Proxied olmalı;"
echo "  SSL/TLS modu 'Flexible' (veya Origin Cert kurup 'Full (strict)')."
if $SEED; then
  echo
  echo "  Seed hesapları: admin@quanta.local / Admin123!"
  echo "  !! İlk girişten sonra admin şifresini mutlaka değiştirin."
fi
echo "================================================="
