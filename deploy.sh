#!/usr/bin/env bash
# ============================================================
# deploy.sh — Script único do PMPlan para Linux/macOS.
# Actualiza, instala, faz o build e deixa a aplicação a correr.
#
# Uso: ./deploy.sh              (ou PORT=9000 ./deploy.sh)
#
# Faz tudo de seguida, sem opções:
#   1. actualiza a partir do GitHub (se der; senão segue com o código local)
#   2. instala dependências (só se faltarem ou estiverem desactualizadas)
#   3. build de produção
#   4. arranca o servidor
#
# Requisitos: node/npm e um .env preenchido (ver .env.example).
#
# Equivalente Windows: deploy.ps1
# ============================================================
set -euo pipefail

PORT="${PORT:-8080}"
APP_NAME="pmplan"

cd "$(dirname "$0")"

# --- 0. Verificações prévias --------------------------------
for cmd in node npm; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "ERRO: $cmd não encontrado. Instala o Node.js: https://nodejs.org/" >&2
    exit 1
  }
done

if [ ! -f .env ]; then
  cp .env.example .env
  echo "ERRO: não havia .env — foi criado a partir do .env.example." >&2
  echo "      Preenche as chaves do Supabase/MSAL e volta a correr ./deploy.sh" >&2
  exit 1
fi

# --- 1. Actualizar a partir do GitHub -----------------------
# Best-effort: sem rede, sem remote, ou com alterações locais por commitar, o
# deploy segue com o código que está em disco em vez de abortar. Falhar aqui
# nunca deve impedir a aplicação de arrancar.
echo "==> A actualizar código a partir do GitHub..."
if ! command -v git >/dev/null 2>&1 || [ ! -d .git ]; then
  echo "    (sem git/repositório — a usar o código local)"
elif ! git fetch origin 2>/dev/null; then
  echo "    AVISO: não foi possível contactar o GitHub — a usar o código local."
else
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if git pull --ff-only origin "$BRANCH" 2>/dev/null; then
    echo "    Actualizado ($BRANCH)."
  else
    echo "    AVISO: pull não aplicado (alterações locais ou divergência) — a usar o código local."
  fi
fi

# --- 2. Dependências ----------------------------------------
# Não basta o node_modules existir: uma instalação interrompida (ou copiada de
# outra máquina) deixa os pacotes lá mas o node_modules/.bin vazio, e o build
# rebenta com "tsc: not found". Confirmar os executáveis de que o build precisa.
deps_broken() {
  if [ ! -d node_modules ]; then return 0; fi
  for bin in tsc vite; do
    if [ ! -e "node_modules/.bin/$bin" ]; then return 0; fi
  done
  return 1
}

if deps_broken; then
  # npm ci apaga o node_modules e reinstala a partir do lockfile — é o que
  # garante uma árvore coerente quando a actual está incompleta.
  echo "==> A instalar dependências (npm ci)..."
  npm ci || npm install
elif [ package-lock.json -nt node_modules ]; then
  echo "==> Dependências desactualizadas, a instalar (npm install)..."
  npm install
else
  echo "==> Dependências já instaladas."
fi

# --- 3. Build -----------------------------------------------
echo "==> A fazer o build de produção..."
npm run build

if [ ! -f dist/index.html ]; then
  echo "ERRO: o build terminou mas dist/index.html não existe." >&2
  exit 1
fi

# --- 4. Arrancar --------------------------------------------
# Limpa uma instância anterior que tenha ficado a segurar a porta — senão o
# "serve" falhava com "port in use" e o deploy morria no último passo.
port_pid() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null | head -1
  elif command -v fuser >/dev/null 2>&1; then
    fuser -n tcp "$PORT" 2>/dev/null | tr -s ' ' '\n' | head -1
  fi
}

OLD_PID="$(port_pid || true)"
if [ -n "${OLD_PID:-}" ]; then
  OLD_NAME="$(ps -p "$OLD_PID" -o comm= 2>/dev/null || true)"
  case "$OLD_NAME" in
    *node*|*npx*|*serve*)
      echo "==> A parar a instância anterior na porta $PORT (PID $OLD_PID)..."
      pkill -P "$OLD_PID" 2>/dev/null || true
      kill -9 "$OLD_PID" 2>/dev/null || true
      sleep 1
      ;;
    '') : ;;  # sem lsof/fuser/ps utilizável — segue e deixa o serve dar o erro
    *)
      echo "ERRO: a porta $PORT está ocupada pelo processo $OLD_PID ($OLD_NAME), alheio ao PMPlan." >&2
      echo "      Fecha essa aplicação ou usa outra porta: PORT=9000 ./deploy.sh" >&2
      exit 1
      ;;
  esac
fi

echo "==> PMPlan disponível em http://localhost:$PORT"

# Num servidor com pm2 o processo fica a correr depois do logout (é o caso da
# VPS); numa máquina normal fica em primeiro plano, e o Ctrl+C pára-o.
# `--yes` para o npx não ficar à espera de confirmação a instalar o "serve".
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
  else
    pm2 start npx --name "$APP_NAME" -- --yes serve -s dist -l "$PORT"
    pm2 save
  fi
  echo "==> A correr sob pm2. Estado: pm2 status $APP_NAME · Logs: pm2 logs $APP_NAME"
else
  echo "    (Ctrl+C para parar)"
  exec npx --yes serve -s dist -l "$PORT"
fi
