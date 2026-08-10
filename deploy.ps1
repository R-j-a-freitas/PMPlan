# ============================================================
# deploy.ps1 - Script unico do PMPlan para Windows.
# Actualiza, instala, faz o build e deixa a aplicacao a correr.
#
# Uso:  .\deploy.ps1
#       .\deploy.ps1 -Port 9000
#
# Faz tudo de seguida, sem opcoes:
#   1. actualiza a partir do GitHub (se der; senao segue com o codigo local)
#   2. instala dependencias (so se faltarem ou estiverem desactualizadas)
#   3. para a instancia anterior (tem de ser antes do build - ver nota no passo 3)
#   4. build de producao
#   5. arranca o servidor (Ctrl+C para parar)
#
# Requisitos: Node.js e um .env preenchido (ver .env.example).
#
# Se o PowerShell recusar correr o script:
#   powershell -ExecutionPolicy Bypass -File .\deploy.ps1
#
# Equivalente Linux: deploy.sh
# ============================================================
[CmdletBinding()]
param(
    [int] $Port = $(if ($env:PORT) { [int]$env:PORT } else { 8080 })
)

# Sem $ErrorActionPreference = 'Stop': no PowerShell 5.1 o git/npm escrevem
# progresso normal no stderr, e com 'Stop' isso abortava o script a meio de um
# passo bem sucedido. O controlo de erros aqui e feito por $LASTEXITCODE.
Set-Location $PSScriptRoot

# --- 0. Verificacoes previas --------------------------------
foreach ($cmd in @('node', 'npm')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "ERRO: $cmd nao encontrado. Instala o Node.js: https://nodejs.org/" -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path '.env')) {
    try {
        Copy-Item '.env.example' '.env' -ErrorAction Stop
        Write-Host 'ERRO: nao havia .env - foi criado a partir do .env.example.' -ForegroundColor Red
        Write-Host '      Preenche as chaves do Supabase/MSAL e volta a correr .\deploy.ps1' -ForegroundColor Red
    } catch {
        Write-Host 'ERRO: .env nao existe e nao foi possivel criar a partir do .env.example.' -ForegroundColor Red
    }
    exit 1
}

# --- 1. Actualizar a partir do GitHub -----------------------
# Best-effort: sem rede, sem remote, ou com alteracoes locais por commitar, o
# deploy segue com o codigo que esta em disco em vez de abortar. Falhar aqui
# nunca deve impedir a aplicacao de arrancar.
Write-Host '==> A actualizar codigo a partir do GitHub...' -ForegroundColor Cyan
if ((-not (Get-Command git -ErrorAction SilentlyContinue)) -or (-not (Test-Path '.git'))) {
    Write-Host '    (sem git/repositorio - a usar o codigo local)' -ForegroundColor DarkGray
} else {
    git fetch origin --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host '    AVISO: nao foi possivel contactar o GitHub - a usar o codigo local.' -ForegroundColor Yellow
    } else {
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        git pull --ff-only --quiet origin $branch
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    Actualizado ($branch)." -ForegroundColor DarkGray
        } else {
            Write-Host '    AVISO: pull nao aplicado (alteracoes locais ou divergencia) - a usar o codigo local.' -ForegroundColor Yellow
        }
    }
}

# --- 2. Dependencias ----------------------------------------
# Nao basta o node_modules existir: uma instalacao interrompida (ou copiada de
# outra maquina) deixa os pacotes la mas o node_modules\.bin vazio, e o build
# rebenta com "tsc is not recognized". Confirmar os executaveis que o build usa.
$depsBroken = -not (Test-Path 'node_modules')
if (-not $depsBroken) {
    foreach ($bin in @('tsc', 'vite')) {
        if (-not (Test-Path "node_modules\.bin\$bin.cmd")) { $depsBroken = $true }
    }
}

if ($depsBroken) {
    # npm ci apaga o node_modules e reinstala a partir do lockfile - e o que
    # garante uma arvore coerente quando a actual esta incompleta.
    Write-Host '==> A instalar dependencias (npm ci)...' -ForegroundColor Cyan
    npm ci
    if ($LASTEXITCODE -ne 0) { npm install }
    if ($LASTEXITCODE -ne 0) { Write-Host 'ERRO: a instalacao de dependencias falhou.' -ForegroundColor Red; exit 1 }
} elseif ((Get-Item 'package-lock.json').LastWriteTime -gt (Get-Item 'node_modules').LastWriteTime) {
    Write-Host '==> Dependencias desactualizadas, a instalar (npm install)...' -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Host 'ERRO: npm install falhou.' -ForegroundColor Red; exit 1 }
} else {
    Write-Host '==> Dependencias ja instaladas.' -ForegroundColor DarkGray
}

# --- 3. Parar a instancia anterior --------------------------
# ANTES do build, nao depois: no Windows o "serve" mantem handles abertos sobre
# os ficheiros de dist/, e o vite comeca por esvaziar essa pasta - com o servidor
# antigo vivo o build rebenta com EPERM/rmdir e o deploy nunca chega ao fim.
# (No Linux isto nao acontece - por isso o deploy.sh so o faz no fim, e assim o
# site continua a servir a versao antiga enquanto o build corre.)
if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $oldPid = [int] $conn.OwningProcess
        $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        $name = if ($proc) { $proc.ProcessName } else { '' }
        if ($name -match '^(node|npx|cmd|conhost)$') {
            Write-Host "==> A parar a instancia anterior na porta $Port (PID $oldPid)..." -ForegroundColor Cyan
            # E o processo que esta mesmo a ouvir (o node), nao o npx.cmd que o
            # lancou - mata-lo liberta a porta, e o pai sai atras dele.
            Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        } else {
            Write-Host "ERRO: a porta $Port esta ocupada pelo processo $oldPid ($name), alheio ao PMPlan." -ForegroundColor Red
            Write-Host "      Fecha essa aplicacao ou usa outra porta: .\deploy.ps1 -Port 9000" -ForegroundColor Red
            exit 1
        }
    }
}

# --- 4. Build -----------------------------------------------
Write-Host '==> A fazer o build de producao...' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host 'ERRO: o build falhou.' -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'dist/index.html')) {
    Write-Host 'ERRO: o build terminou mas dist/index.html nao existe.' -ForegroundColor Red
    exit 1
}

# --- 5. Arrancar --------------------------------------------
Write-Host "==> PMPlan disponivel em http://localhost:$Port" -ForegroundColor Green
Write-Host '    (Ctrl+C para parar)' -ForegroundColor DarkGray

# --yes para o npx nao ficar a espera de confirmacao a instalar o "serve".
npx --yes serve -s dist -l "$Port"
