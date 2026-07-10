#!/usr/bin/env bash
# ============================================================
# start.sh — Arranca o PMPlan em modo de desenvolvimento
# Uso: ./start.sh
# ============================================================
set -euo pipefail

# Trabalhar sempre a partir da pasta onde o script está
cd "$(dirname "$0")"

# --- Verificações prévias -----------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "ERRO: Node.js não encontrado. Instala a partir de https://nodejs.org/" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "AVISO: .env não existe. A copiar de .env.example — preenche as variáveis antes de usar."
  cp .env.example .env
fi

# Instalar dependências se ainda não existirem
if [ ! -d node_modules ]; then
  echo "A instalar dependências (npm install)..."
  npm install
fi

# --- Arrancar o servidor de desenvolvimento -----------------
echo "A arrancar o PMPlan (Vite dev server)..."
npm run dev
