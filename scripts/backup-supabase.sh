#!/usr/bin/env bash
# PMPlan — backup diário da base de dados Supabase (Fase 4).
#
# PORQUÊ: o keep-alive impede a pausa, mas não protege contra o que realmente destrói
# dados — um DELETE sem WHERE, uma migração mal aplicada, ou a perda da conta Supabase.
# Um projecto sem cópia fora do fornecedor tem um único ponto de falha.
#
# O QUE FAZ, por esta ordem:
#   1. pg_dump do schema `public` em formato custom (-Fc, comprimido nativamente)
#   2. pg_dump dos utilizadores (auth.users) — sem eles, restaurar deixa toda a gente
#      sem conseguir entrar
#   3. verificação de integridade: pg_restore --list tem de conseguir ler o arquivo
#   4. verificação de dimensão: zero, ausente, ou muito menor que o anterior → alerta
#   5. rotação para semanal/mensal e purga (7 diários, 4 semanais, 3 mensais)
#
# Sai com código != 0 a qualquer falha, e envia email pelo Resend antes de sair.
#
# Configuração: /etc/pmplan/backup.env (modo 600) — ver deploy/backup/backup.env.example

set -euo pipefail

# ─── Configuração ─────────────────────────────────────────────────────────────
: "${PGURL:?PGURL não definida (ver backup.env.example)}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/pmplan}"
LOG_FILE="${BACKUP_LOG:-/var/log/pmplan/backup.log}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-3}"
MIN_BYTES="${MIN_BYTES:-10240}"          # abaixo disto o dump é lixo, não um backup
SHRINK_PCT="${SHRINK_PCT:-50}"           # alerta se encolher mais do que isto face ao anterior
RESEND_API_KEY="${RESEND_API_KEY:-}"
ALERT_EMAIL_TO="${ALERT_EMAIL_TO:-}"
RESEND_FROM_EMAIL="${RESEND_FROM_EMAIL:-onboarding@resend.dev}"
RESEND_FROM_NAME="${RESEND_FROM_NAME:-PMPlan}"

DATE="$(date -u +%Y-%m-%d)"
DOW="$(date -u +%u)"    # 1=segunda … 7=domingo
DOM="$(date -u +%d)"

DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"
MONTHLY_DIR="$BACKUP_ROOT/monthly"

DUMP="$DAILY_DIR/pmplan-$DATE.dump"
USERS="$DAILY_DIR/pmplan-users-$DATE.sql.gz"

log() {
  local line="$(date -u +%Y-%m-%dT%H:%M:%SZ) [$1] backup: $2"
  echo "$line"
  # Um /var/log inacessível não pode fazer falhar o backup — o backup é que importa.
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
  echo "$line" >> "$LOG_FILE" 2>/dev/null || true
}

# Escapa uma cadeia para valor JSON. Feito com sed/awk e não com jq ou python3 de
# propósito: a VPS serve ficheiros estáticos e não tem obrigação de ter nenhum dos dois
# instalado. Um alerta que não sai por falta de interpretador é um alerta que não existe.
json_string() {
  printf '%s' "$1" \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\r//g' \
    | awk 'BEGIN { ORS = ""; print "\"" } { print (NR > 1 ? "\\n" : "") $0 } END { print "\"" }'
}

# Alerta por email directamente pela API do Resend. Tal como no verificador de heartbeat,
# NÃO passa pelas Edge Functions do Supabase: se o Supabase for o problema, esse caminho
# está morto exactamente quando é preciso.
alert() {
  local subject="$1" body="$2" to_json
  log ERROR "$subject"
  if [ -z "$RESEND_API_KEY" ] || [ -z "$ALERT_EMAIL_TO" ]; then
    log ERROR "sem RESEND_API_KEY ou ALERT_EMAIL_TO — alerta NÃO enviado"
    return 0
  fi
  to_json="$(printf '%s' "$ALERT_EMAIL_TO" | tr ',' '\n' | sed 's/^ *//; s/ *$//; /^$/d' \
             | awk 'BEGIN { ORS = "" } { print (NR > 1 ? "," : "") "\"" $0 "\"" }')"
  if curl -sS -o /dev/null -X POST 'https://api.resend.com/emails' \
      -H "Authorization: Bearer $RESEND_API_KEY" \
      -H 'Content-Type: application/json' \
      --max-time 20 \
      -d "{\"from\":$(json_string "$RESEND_FROM_NAME <$RESEND_FROM_EMAIL>"),\"to\":[$to_json],\"subject\":$(json_string "$subject"),\"text\":$(json_string "$body")}"; then
    log INFO "alerta enviado para $ALERT_EMAIL_TO"
  else
    log ERROR "falha ao enviar alerta pelo Resend"
  fi
  return 0
}

die() {
  # Apagar SEMPRE os artefactos desta execução antes de sair. Sem isto, um dump que
  # falhou a verificação de integridade ficava em daily/ e — o problema a sério — contava
  # para a retenção de 7, expulsando um backup BOM para dar lugar a um inútil. Ao fim de
  # uma semana de falhas silenciosas não sobrava um único backup restaurável.
  rm -f "$DUMP" "$USERS"

  alert "[PMPlan] Backup FALHOU ($DATE)" "$1

O backup diário da base de dados não foi concluído, e os ficheiros parciais desta
execução foram removidos. O ponto de recuperação recua para o último backup válido.

Diagnóstico:
  journalctl -u pmplan-backup.service -n 50
  ls -lh $DAILY_DIR
  tail -40 $LOG_FILE

Procedimento completo em DOCS/DISASTER_RECOVERY.md."
  exit 1
}

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR"

# Guardar a dimensão do dump anterior ANTES de escrever o novo — é a referência da
# verificação de anomalia. Se não houver anterior, não há com que comparar (primeira
# execução) e só a verificação de mínimo absoluto se aplica.
PREV_SIZE=0
PREV_FILE="$(ls -1t "$DAILY_DIR"/pmplan-*.dump 2>/dev/null | head -1 || true)"
if [ -n "$PREV_FILE" ] && [ -f "$PREV_FILE" ]; then
  PREV_SIZE="$(stat -c %s "$PREV_FILE")"
fi

log INFO "a iniciar (destino $DUMP)"

# ─── 1. Schema + dados de `public` ────────────────────────────────────────────
# -Fc (custom): comprimido de origem, e — mais importante — permite validar o arquivo
# com pg_restore --list, o que um .sql.gz não permite. Restauro selectivo por tabela
# também só é possível neste formato.
# --no-owner: o dono no destino será quem restaura; sem isto o restauro numa instância
# limpa falha em cada objecto por o papel original não existir lá.
if ! pg_dump "$PGURL" \
      --schema=public \
      --format=custom \
      --compress=9 \
      --no-owner \
      --file="$DUMP" 2>>"$LOG_FILE"; then
  rm -f "$DUMP"
  die "pg_dump do schema public falhou. Ver o log para o erro do Postgres."
fi

# ─── 2. Utilizadores ──────────────────────────────────────────────────────────
# auth.users é gerido pela plataforma e não vem no dump de `public`. Sem ele o restauro
# devolve os dados mas ninguém consegue entrar na aplicação — recuperação pela metade.
# Falha aqui NÃO é fatal: um backup de dados sem utilizadores continua a valer muito
# mais do que backup nenhum. Alerta e continua.
if ! pg_dump "$PGURL" \
      --table=auth.users \
      --data-only \
      --no-owner \
      2>>"$LOG_FILE" | gzip -9 > "$USERS"; then
  rm -f "$USERS"
  alert "[PMPlan] Backup: utilizadores não exportados ($DATE)" \
    "O dump de auth.users falhou, mas o dump dos dados de public foi concluído.
Restaurar a partir deste backup recupera os dados mas não as contas de utilizador."
fi

# ─── 3. Integridade ───────────────────────────────────────────────────────────
# Muito mais forte do que olhar para a dimensão: pg_restore --list lê o índice do
# arquivo e falha se estiver truncado ou corrompido. Um dump interrompido a meio pode
# ter dimensão plausível e ser inútil — isto apanha-o.
LIST_TMP="$(mktemp)"
# O código de saída do pg_restore tem de ser avaliado SOZINHO. Numa pipeline com
# `|| true` (que a versão anterior deste script usava) o erro era engolido e a
# verificação de integridade nunca disparava — uma verificação que não verifica nada é
# pior do que nenhuma, porque dá confiança.
if ! pg_restore --list "$DUMP" > "$LIST_TMP" 2>>"$LOG_FILE"; then
  rm -f "$LIST_TMP"
  die "pg_restore --list não conseguiu ler $DUMP — arquivo corrompido ou truncado."
fi
OBJECTS="$(grep -c ';' "$LIST_TMP" || true)"
rm -f "$LIST_TMP"
if [ "${OBJECTS:-0}" -lt 10 ]; then
  die "O dump tem apenas $OBJECTS objectos, o que é implausível para este schema.
Suspeita-se de dump vazio ou de ligação a uma base de dados errada."
fi
log INFO "integridade OK ($OBJECTS objectos no arquivo)"

# ─── 4. Dimensão ──────────────────────────────────────────────────────────────
SIZE="$(stat -c %s "$DUMP")"
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  die "O dump tem $SIZE bytes (mínimo aceitável: $MIN_BYTES). Backup inútil."
fi
if [ "$PREV_SIZE" -gt 0 ]; then
  # Encolhimento brusco é o sinal de uma perda de dados que ainda ninguém notou —
  # exactamente o caso em que se quer o alerta ANTES de os backups bons expirarem.
  THRESHOLD=$(( PREV_SIZE * (100 - SHRINK_PCT) / 100 ))
  if [ "$SIZE" -lt "$THRESHOLD" ]; then
    alert "[PMPlan] Backup com dimensão anómala ($DATE)" \
      "O backup de hoje tem $SIZE bytes; o anterior tinha $PREV_SIZE bytes.
Uma redução superior a ${SHRINK_PCT}% sugere perda de dados na base de dados de origem.

O backup foi guardado (não foi descartado) — mas convém confirmar a origem antes de
os backups mais antigos serem purgados.

Ficheiro: $DUMP"
  fi
fi
log INFO "dimensão $SIZE bytes (anterior: $PREV_SIZE)"

# ─── 5. Rotação e purga ───────────────────────────────────────────────────────
# Ligações físicas (hardlinks) e não cópias: o mesmo inode em daily/ e weekly/ não gasta
# espaço duas vezes, e o ficheiro só desaparece do disco quando a última referência for
# removida. Um mês de retenção custa o mesmo que os 7 diários.
if [ "$DOW" = "7" ]; then
  ln -f "$DUMP" "$WEEKLY_DIR/pmplan-$DATE.dump" && log INFO "promovido a semanal"
fi
if [ "$DOM" = "01" ]; then
  ln -f "$DUMP" "$MONTHLY_DIR/pmplan-$DATE.dump" && log INFO "promovido a mensal"
fi

prune() {
  local dir="$1" keep="$2" pattern="$3" removed=0
  # `ls -1t` ordena por mtime decrescente; tail -n +N devolve o que passa do limite.
  while IFS= read -r old; do
    [ -n "$old" ] || continue
    rm -f "$old" && removed=$((removed + 1))
  done < <(ls -1t "$dir"/$pattern 2>/dev/null | tail -n +$((keep + 1)))
  [ "$removed" -gt 0 ] && log INFO "purgados $removed de $(basename "$dir")"
  return 0
}

prune "$DAILY_DIR"   "$KEEP_DAILY"   'pmplan-2*.dump'
prune "$DAILY_DIR"   "$KEEP_DAILY"   'pmplan-users-*.sql.gz'
prune "$WEEKLY_DIR"  "$KEEP_WEEKLY"  'pmplan-*.dump'
prune "$MONTHLY_DIR" "$KEEP_MONTHLY" 'pmplan-*.dump'

log INFO "concluído — $(ls -1 "$DAILY_DIR"/pmplan-2*.dump 2>/dev/null | wc -l) diários, $(ls -1 "$WEEKLY_DIR" 2>/dev/null | wc -l) semanais, $(ls -1 "$MONTHLY_DIR" 2>/dev/null | wc -l) mensais"
