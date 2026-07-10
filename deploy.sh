#!/usr/bin/env bash
# ============================================================
# deploy.sh — Actualiza o PMPlan no servidor a partir do GitHub,
# faz o build e (re)arranca o servidor de produção.
#
# Uso: ./deploy.sh
#
# Requisitos no servidor:
#   - git, node/npm instalados
#   - repositório já clonado (este script corre dentro dele)
#   - ficheiro .env preenchido (não vem do GitHub)
#
# O site é servido com "serve" (estático, a partir de dist/).
# Se o pm2 estiver instalado é usado para gerir o processo
# (reinício automático, sobrevive a logout); caso contrário
# usa-se nohup com um ficheiro PID.
# ============================================================
set -euo pipefail

PORT="${PORT:-8080}"          # porta de produção (export PORT=xxxx para mudar)
APP_NAME="pmplan"
PID_FILE=".pmplan.pid"

cd "$(dirname "$0")"

# --- Verificações prévias -----------------------------------
if [ ! -f .env ]; then
  echo "ERRO: .env não existe no servidor. Cria-o a partir do .env.example antes do deploy." >&2
  exit 1
fi

# --- 1. Actualizar a partir do GitHub -----------------------
echo "==> A actualizar código a partir do GitHub..."
git fetch origin
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git pull --ff-only origin "$BRANCH"

# --- 2. Instalar dependências e fazer o build ---------------
echo "==> A instalar dependências (npm ci)..."
npm ci

echo "==> A fazer o build de produção..."
npm run build

# --- 3. (Re)arrancar o servidor -----------------------------
echo "==> A (re)arrancar o servidor na porta $PORT..."

if command -v pm2 >/dev/null 2>&1; then
  # pm2 gere o processo: reinicia se já existir, senão cria
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
  else
    pm2 start npx --name "$APP_NAME" -- serve -s dist -l "$PORT"
    pm2 save
  fi
  echo "==> Deploy concluído. Estado: pm2 status $APP_NAME"
else
  # Fallback sem pm2: parar o processo anterior e arrancar de novo
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "    A parar o processo anterior (PID $(cat "$PID_FILE"))..."
    kill "$(cat "$PID_FILE")"
    sleep 1
  fi
  nohup npx serve -s dist -l "$PORT" > pmplan.log 2>&1 &
  echo $! > "$PID_FILE"
  echo "==> Deploy concluído. PID $(cat "$PID_FILE"), logs em pmplan.log"
fi

echo "==> PMPlan disponível em http://localhost:$PORT"
