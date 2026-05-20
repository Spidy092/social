#!/usr/bin/env bash
set -Eeuo pipefail

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33mWARN: %s\033[0m\n' "$*" >&2; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ ${EUID:-$(id -u)} -eq 0 ]] || die "Run this script with sudo: sudo ./setup.sh"

APP_NAME="${APP_NAME:-social-poster}"
APP_USER="${APP_USER:-${SUDO_USER:-ec2-user}}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
DOMAIN="${DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
PORT="${PORT:-3000}"
DB_NAME="${DB_NAME:-social_poster}"
DB_USER="${DB_USER:-social_poster}"
DB_PASSWORD="${DB_PASSWORD:-123456}"
ENABLE_SSL="${ENABLE_SSL:-true}"

[[ -f "$APP_DIR/package.json" ]] || die "package.json not found in APP_DIR=$APP_DIR"
[[ -f "$APP_DIR/.env" ]] || die ".env not found in $APP_DIR. Create it from .env.example first."
[[ -n "$DB_PASSWORD" ]] || die "Set DB_PASSWORD before running, for example: DB_PASSWORD='strong-password' sudo -E ./setup.sh"
[[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "DB_NAME must be a simple PostgreSQL identifier"
[[ "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "DB_USER must be a simple PostgreSQL identifier"

if [[ "$ENABLE_SSL" == "true" ]]; then
  [[ -n "$DOMAIN" ]] || die "Set DOMAIN when ENABLE_SSL=true"
  [[ -n "$LETSENCRYPT_EMAIL" ]] || die "Set LETSENCRYPT_EMAIL when ENABLE_SSL=true"
fi

source /etc/os-release
case "${ID:-}" in
  ubuntu|debian)
    PKG_MANAGER="apt"
    ;;
  amzn)
    PKG_MANAGER="dnf"
    ;;
  *)
    die "Unsupported OS: ${PRETTY_NAME:-unknown}. Supported: Ubuntu/Debian or Amazon Linux 2023."
    ;;
esac

install_packages_apt() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y curl ca-certificates gnupg git nginx postgresql postgresql-contrib certbot python3-certbot-nginx
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
}

install_packages_dnf() {
  dnf update -y
  dnf install -y curl git nginx postgresql15-server postgresql15-contrib certbot python3-certbot-nginx
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 20 ]]; then
    dnf install -y nodejs20 || dnf install -y nodejs
  fi
  if [[ ! -f /var/lib/pgsql/data/PG_VERSION ]]; then
    postgresql-setup --initdb
  fi
}

log "Installing system packages"
if [[ "$PKG_MANAGER" == "apt" ]]; then install_packages_apt; else install_packages_dnf; fi

log "Enabling services"
systemctl enable --now nginx
if systemctl list-unit-files postgresql.service 2>/dev/null | grep -q '^postgresql.service'; then
  systemctl enable --now postgresql
elif systemctl list-unit-files postgresql-15.service 2>/dev/null | grep -q '^postgresql-15.service'; then
  systemctl enable --now postgresql-15
else
  die "PostgreSQL service was not found after installation. Try: sudo systemctl status postgresql"
fi

log "Creating PostgreSQL user and database"
sudo -u postgres psql -v ON_ERROR_STOP=1 \
  --set=db_user="$DB_USER" \
  --set=db_password="$DB_PASSWORD" \
  --set=db_name="$DB_NAME" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user')\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user')\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')\gexec
SQL

log "Updating .env database and app URL values"
python3 - "$APP_DIR/.env" "$DB_USER" "$DB_PASSWORD" "$DB_NAME" "$DOMAIN" "$PORT" "$ENABLE_SSL" <<'PY'
from pathlib import Path
from urllib.parse import quote
import sys
path, user, password, db, domain, port, ssl = sys.argv[1:]
values = {}
for line in Path(path).read_text().splitlines():
    if line and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        values[key] = value
scheme = 'https' if ssl == 'true' else 'http'
host = domain if domain else 'localhost'
updates = {
    'PORT': port,
    'NODE_ENV': 'production',
    'APP_URL': f'{scheme}://{host}',
    'DATABASE_URL': f'postgresql://{quote(user)}:{quote(password)}@127.0.0.1:5432/{quote(db)}',
}
lines = Path(path).read_text().splitlines()
seen = set()
out = []
for line in lines:
    if line and not line.lstrip().startswith('#') and '=' in line:
        key = line.split('=', 1)[0]
        if key in updates:
            out.append(f'{key}={updates[key]}')
            seen.add(key)
            continue
    out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f'{key}={value}')
Path(path).write_text('\n'.join(out) + '\n')
PY

log "Installing Node dependencies and running migrations"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev
sudo -u "$APP_USER" npm run db:migrate

log "Installing PM2 and starting app"
npm install -g pm2
sudo -u "$APP_USER" env PATH="$PATH" pm2 start app.js --name "$APP_NAME" --update-env || sudo -u "$APP_USER" env PATH="$PATH" pm2 restart "$APP_NAME" --update-env
sudo -u "$APP_USER" env PATH="$PATH" pm2 save
pm2 startup systemd -u "$APP_USER" --hp "$(getent passwd "$APP_USER" | cut -d: -f6)"

log "Configuring Nginx"
cat > "/etc/nginx/conf.d/${APP_NAME}.conf" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN:-_};

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
nginx -t
systemctl reload nginx

if [[ "$ENABLE_SSL" == "true" ]]; then
  log "Requesting HTTPS certificate"
  certbot --nginx --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" -d "$DOMAIN" --redirect
fi

log "Done"
BASE_URL="$([[ "$ENABLE_SSL" == "true" ]] && printf 'https://%s' "$DOMAIN" || printf 'http://%s' "${DOMAIN:-$(hostname -I | awk '{print $1}')}")"
printf 'App URL: %s\n' "$BASE_URL"
printf 'Health check: %s/health\n' "$BASE_URL"
printf '\nNext steps:\n'
printf '  1. Point your domain DNS A record to this EC2 public IP before SSL runs.\n'
printf '  2. Update Meta/LinkedIn/Google OAuth redirect URIs to use your HTTPS domain.\n'
printf '  3. Run once if you need the admin user: cd %s && sudo -u %s npm run db:seed\n' "$APP_DIR" "$APP_USER"
