#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-_}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$REPO_ROOT/backend"
FRONTEND="$REPO_ROOT/frontend"
SITE_OWNER="$(stat -c '%U' "$REPO_ROOT")"

if [[ ! -d "$BACKEND" || ! -d "$FRONTEND" ]]; then
  echo "ошибка: рядом с deploy.sh должны быть папки backend и frontend (сейчас: $REPO_ROOT)"
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "запусти от root на сервере: sudo bash deploy.sh твой.домен"
  echo "или без домена: sudo bash deploy.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl nginx build-essential python3 ca-certificates

if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" 2>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

run_as_owner() {
  local cmd=$1
  if [[ "$SITE_OWNER" != "root" ]]; then
    sudo -u "$SITE_OWNER" -H bash -lc "$cmd"
  else
    bash -lc "$cmd"
  fi
}

mkdir -p "$BACKEND/data/uploads" "$BACKEND/data/library" "$BACKEND/data/private-files"
chown -R "$SITE_OWNER:$SITE_OWNER" "$BACKEND/data" 2>/dev/null || true

if [[ ! -f "$BACKEND/.env" ]]; then
  j="$(openssl rand -hex 32)"
  u="$SITE_OWNER"
  cat >"$BACKEND/.env" <<EOF
PORT=3000
JWT_SECRET=$j
DATABASE_FILE=$BACKEND/data/edu.db
UPLOADS_DIR=$BACKEND/data/uploads
LIBRARY_DIR=$BACKEND/data/library
PRIVATE_FILES_DIR=$BACKEND/data/private-files
EOF
  chown "$u:$u" "$BACKEND/.env"
  chmod 600 "$BACKEND/.env"
fi

run_as_owner "cd \"$BACKEND\" && npm ci"
run_as_owner "cd \"$FRONTEND\" && npm ci && npm run build"

NODE_BIN="$(command -v node)"
cat >/etc/systemd/system/enoobis-backend.service <<EOF
[Unit]
Description=enoobis backend
After=network.target

[Service]
Type=simple
User=$SITE_OWNER
WorkingDirectory=$BACKEND
Environment=NODE_ENV=production
ExecStart=$NODE_BIN src/server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable enoobis-backend
systemctl restart enoobis-backend

LE_LIVE=""
if [[ -n "${1:-}" && "$DOMAIN" != "_" ]]; then
  shopt -s nullglob
  for d in /etc/letsencrypt/live/"${DOMAIN}"*; do
    if [[ -f "$d/fullchain.pem" && -f "$d/privkey.pem" ]]; then
      LE_LIVE="$d"
      break
    fi
  done
  shopt -u nullglob
fi

ssl_lines=""
if [[ -n "$LE_LIVE" ]]; then
  ssl_lines="    ssl_certificate $LE_LIVE/fullchain.pem;
    ssl_certificate_key $LE_LIVE/privkey.pem;"
  if [[ -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
    ssl_lines="$ssl_lines
    include /etc/letsencrypt/options-ssl-nginx.conf;"
  fi
  if [[ -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
    ssl_lines="$ssl_lines
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
  fi
fi

if [[ -n "$LE_LIVE" ]]; then
  cat >/etc/nginx/sites-available/enoobis <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $DOMAIN;

    client_max_body_size 200m;

    root $FRONTEND/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name $DOMAIN;
$ssl_lines

    client_max_body_size 200m;

    root $FRONTEND/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
else
  cat >/etc/nginx/sites-available/enoobis <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $DOMAIN;

    client_max_body_size 200m;

    root $FRONTEND/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
fi

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/enoobis /etc/nginx/sites-enabled/enoobis
nginx -t
systemctl reload nginx

echo ""
echo "готово. бэк: systemctl status enoobis-backend"
if [[ -n "${1:-}" && "$DOMAIN" != "_" && -z "$LE_LIVE" ]]; then
  echo "https (один раз): apt install -y certbot python3-certbot-nginx && certbot --nginx -d $DOMAIN"
fi
echo "обновление: cd $REPO_ROOT && git pull && sudo bash deploy.sh ${1:-}"
