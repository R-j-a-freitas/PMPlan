# Recuperação de desastre — PMPlan

Como voltar a ter a aplicação a funcionar quando a base de dados se perde, corrompe ou
fica inacessível.

> **Se está a ler isto durante um incidente**, salte para o cenário que se aplica:
> [projecto pausado](#cenário-a--projecto-pausado) ·
> [dados apagados](#cenário-b--dados-apagados-ou-corrompidos) ·
> [projecto perdido](#cenário-c--projecto-ou-conta-supabase-perdidos)

---

## O que existe, e o que isso significa

| | |
|---|---|
| **Onde** | VPS Hetzner, `/var/backups/pmplan/` |
| **Quando** | diário, 02:00–03:00 UTC |
| **Retenção** | 7 diários · 4 semanais (domingos) · 3 mensais (dia 1) |
| **Conteúdo** | schema `public` + dados (formato custom, comprimido) e `auth.users` |
| **RPO** (dados que se perdem) | **até 24 horas** — o trabalho feito desde o último backup nocturno |
| **RTO** (tempo até estar de pé) | **30 a 60 minutos** num projecto novo, com a lista abaixo à mão |

**O que NÃO está no backup**, e tem de ser reposto à mão:

- Edge Functions (estão no repositório, `supabase/functions/` — voltam a ser publicadas)
- Segredos das Edge Functions (`RESEND_API_KEY`, etc.)
- Configuração de autenticação (URLs de redireccionamento, templates de email)
- Ficheiros no Storage — **o projecto não usa Storage**, por isso não há nada a perder aqui
- As chaves `anon` e `service_role`: um projecto novo tem chaves novas, o que obriga a
  actualizar o `.env` e a fazer novo build

---

## Cenário A — projecto pausado

O mais provável e o menos grave: **os dados estão todos lá**, o projecto é que está
adormecido por inactividade.

1. <https://supabase.com/dashboard> → o projecto aparece como *Paused* → **Restore project**
2. Esperar (alguns minutos). Confirmar com:
   ```bash
   curl -sI https://<ref>.supabase.co/auth/v1/health | head -1
   ```
3. Abrir a aplicação e confirmar que o calendário carrega.
4. **Descobrir porque o keep-alive falhou** — ver [KEEP_ALIVE_VPS.md](KEEP_ALIVE_VPS.md).
   Restaurar sem perceber a causa garante uma repetição.

**Não é preciso restaurar backup nenhum neste cenário.** Não o faça: substituir dados
bons por uma cópia de ontem é transformar um susto numa perda real.

---

## Cenário B — dados apagados ou corrompidos

O projecto responde, mas faltam dados (um `DELETE` sem `WHERE`, uma migração que correu
mal, uma importação que duplicou tudo).

### B.1 — Parar a hemorragia

Avisar quem está a usar a aplicação para parar. Cada minuto de utilização sobre dados
corrompidos torna mais difícil separar o bom do mau.

### B.2 — Escolher o backup

```bash
ls -lht /var/backups/pmplan/daily/ /var/backups/pmplan/weekly/ /var/backups/pmplan/monthly/
```

Escolher o **último anterior ao problema**. Se não souber quando começou, o conteúdo do
dump é inspeccionável sem restaurar:

```bash
pg_restore --list /var/backups/pmplan/daily/pmplan-2026-07-30.dump | head -40
```

### B.3 — Restaurar uma só tabela (preferível)

Quase sempre o estrago é numa tabela. Restaurar só essa evita desfazer trabalho legítimo
noutras.

```bash
export PGURL='postgresql://postgres.<ref>:<password>@aws-0-<região>.pooler.supabase.com:5432/postgres'

# 1. Guardar o estado ACTUAL antes de mexer — pode ser preciso voltar atrás
pg_dump "$PGURL" --schema=public --format=custom --no-owner \
        --file=/tmp/pre-restauro-$(date -u +%Y%m%dT%H%M%SZ).dump

# 2. Restaurar apenas a tabela afectada
pg_restore --dbname="$PGURL" \
           --table=pm_events \
           --data-only \
           --disable-triggers \
           --no-owner \
           /var/backups/pmplan/daily/pmplan-2026-07-30.dump
```

`--data-only` sem `--clean` **acrescenta** linhas às existentes. Se quer substituir, é
preciso esvaziar a tabela primeiro — e isso obriga a pensar nas chaves estrangeiras:

```sql
-- Ordem inversa das dependências. pm_events referencia equipment e engineers.
truncate table pm_events cascade;
```

`cascade` apaga também o que depende da tabela. Confirmar o alcance antes de executar:

```sql
select conrelid::regclass as tabela_dependente, conname
from pg_constraint
where confrelid = 'pm_events'::regclass;
```

### B.4 — Restaurar tudo

Quando o estrago é generalizado:

```bash
pg_restore --dbname="$PGURL" \
           --clean --if-exists \
           --no-owner --no-privileges \
           --schema=public \
           /var/backups/pmplan/daily/pmplan-2026-07-30.dump
```

`--clean --if-exists` apaga cada objecto antes de o recriar. **Isto destrói o estado
actual do schema `public`.** O dump de segurança do passo B.3.1 é o que permite recuar.

`--no-privileges` omite os GRANT do dump; as políticas RLS vêm no schema e são
restauradas. Confirmar a seguir que os papéis continuam certos — ver [B.6](#b6--verificação).

### B.5 — Restaurar utilizadores

Só se as contas também se perderam:

```bash
gunzip -c /var/backups/pmplan/daily/pmplan-users-2026-07-30.sql.gz | psql "$PGURL"
```

Se as contas existirem e só faltarem algumas, este passo dá erro de chave duplicada — o
que é seguro, mas não restaura nada. Nesse caso, extrair as linhas em falta à mão.

### B.6 — Verificação

**Não dar por concluído sem isto.**

```sql
-- 1. Contagens plausíveis?
select 'pm_events' t, count(*) from pm_events
union all select 'equipment', count(*) from equipment
union all select 'hospitals', count(*) from hospitals
union all select 'engineers', count(*) from engineers
union all select 'user_profiles', count(*) from user_profiles;

-- 2. O RLS ficou activo? (uma tabela sem RLS depois de um restauro é uma fuga de dados)
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by rowsecurity, tablename;

-- 3. As políticas voltaram?
select tablename, count(*) from pg_policies
where schemaname = 'public' group by tablename order by tablename;

-- 4. As funções de segurança existem?
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('user_role','user_zone_ids','purge_system_heartbeat',
                  'heartbeat_domain_check','heartbeat_status');
```

Depois, na aplicação: entrar como admin, abrir o calendário, confirmar que as PMs
aparecem, e confirmar que um utilizador `engineer` continua a ver apenas a sua zona.

---

## Cenário C — projecto ou conta Supabase perdidos

O pior caso: o projecto foi apagado, a conta foi perdida, ou a Supabase deixou de estar
disponível. É preciso reconstruir numa instância limpa.

### C.1 — Criar o projecto

Novo projecto Supabase (ou qualquer PostgreSQL 17+ com as extensões usadas). Guardar a
password da base de dados — é pedida a seguir.

### C.2 — Criar os papéis em falta

**Este passo é obrigatório e é o que costuma falhar.** O dump contém políticas RLS e
GRANTs que referem papéis; se não existirem, o restauro falha objecto a objecto.

Num projecto Supabase novo, `anon`, `authenticated` e `service_role` já existem. O papel
do keep-alive não:

```sql
-- Aplicar ANTES do restauro
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'pmplan_heartbeat') then
    create role pmplan_heartbeat nologin;
  end if;
end $$;
grant pmplan_heartbeat to authenticator;
```

Se o destino **não** for Supabase, é preciso criar também `anon`, `authenticated`,
`service_role` e `authenticator`, e nesse caso vale a pena restaurar com
`--no-privileges` e reconstruir os GRANTs a partir das migrações.

### C.3 — Restaurar

```bash
export PGURL='postgresql://postgres.<novo-ref>:<password>@aws-0-<região>.pooler.supabase.com:5432/postgres'

pg_restore --dbname="$PGURL" \
           --no-owner --no-privileges \
           --schema=public \
           --exit-on-error \
           /var/backups/pmplan/daily/pmplan-2026-07-30.dump
```

`--exit-on-error` é deliberado aqui, ao contrário do restauro parcial: numa reconstrução
de raiz quer-se saber ao primeiro problema, não descobrir no fim que 200 objectos
falharam e não se sabe quais.

Utilizadores:

```bash
gunzip -c /var/backups/pmplan/daily/pmplan-users-2026-07-30.sql.gz | psql "$PGURL"
```

As palavras-passe vêm cifradas e continuam a funcionar. Se `auth.users` não restaurar
(a estrutura da tabela mudou entre versões do GoTrue), a alternativa é recriar as contas
com `scripts/create-user.mjs` e mandar toda a gente redefinir a palavra-passe.

### C.4 — Repor o que não está no dump

1. **Edge Functions**:
   ```bash
   npx supabase link --project-ref <novo-ref>
   npx supabase functions deploy admin-create-user
   npx supabase functions deploy admin-delete-user
   npx supabase functions deploy send-password-reset
   npx supabase functions deploy send-proposal-email
   ```
2. **Segredos das funções**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`,
   `EMAIL_REPLY_TO_DEFAULT`, `APP_URL` (dashboard → Edge Functions → Secrets)
3. **Aplicação**: actualizar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env` da
   VPS e correr `./deploy.sh` — as chaves do projecto novo são diferentes
4. **Keep-alive**: cunhar novo token (`scripts/mint-heartbeat-token.mjs`, com o JWT
   secret do projecto novo) e actualizar `/etc/pmplan/keep-alive.env` e os GitHub Secrets
5. **Backup**: actualizar `PGURL` em `/etc/pmplan/backup.env`
6. Correr a verificação [B.6](#b6--verificação)

---

## Teste de restauro

**Um backup que nunca foi restaurado não é um backup — é um ficheiro.** A única forma de
saber se serve é experimentar, e o momento errado para descobrir que não serve é durante
um incidente.

### Fazer trimestralmente

Restaurar para um Postgres descartável, num contentor, sem tocar em nada em produção:

```bash
# 1. Postgres 17 temporário
docker run -d --name pmplan-restore-test \
  -e POSTGRES_PASSWORD=teste -p 55432:5432 postgres:17

# 2. Papéis que o dump espera encontrar
docker exec -i pmplan-restore-test psql -U postgres <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role authenticator noinherit login password 'teste';
create role pmplan_heartbeat nologin;
grant anon, authenticated, service_role, pmplan_heartbeat to authenticator;
create role supabase_admin superuser login password 'teste';
SQL

# 3. Restaurar o backup mais recente
LATEST=$(ls -1t /var/backups/pmplan/daily/pmplan-2*.dump | head -1)
pg_restore --dbname='postgresql://postgres:teste@localhost:55432/postgres' \
           --no-owner --no-privileges --schema=public "$LATEST"

# 4. Verificar
docker exec -i pmplan-restore-test psql -U postgres <<'SQL'
select 'tabelas' o, count(*) from pg_tables where schemaname='public'
union all select 'políticas', count(*) from pg_policies where schemaname='public'
union all select 'funções', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'pm_events', count(*) from pm_events
union all select 'equipment', count(*) from equipment;
SQL

# 5. Destruir — não deixar uma cópia dos dados a correr numa porta local
docker rm -f pmplan-restore-test
```

O passo 5 não é opcional. Um contentor esquecido com uma cópia completa da base de dados,
com password `teste` exposta em `localhost:55432`, é pior do que não ter backup nenhum.

### Registo de testes

| Data | Backup usado | Resultado | Quem |
|---|---|---|---|
| *(por preencher — ver nota abaixo)* | | | |

> **Ainda não foi feito nenhum teste de restauro.** A Fase 4 do plano exigia-o, mas o
> ambiente onde este procedimento foi escrito não tem `pg_dump`, `pg_restore`, `psql` nem
> Docker instalados, e não tem a password da base de dados. Os passos acima estão
> escritos com os comandos exactos, mas **não foram executados**. Até a primeira linha
> desta tabela estar preenchida, o procedimento é teoria.

---

## Requisitos das ferramentas

O servidor é **PostgreSQL 17.6**. O `pg_dump` e o `pg_restore` **têm de ser da versão 17
ou superior** — versões mais antigas recusam-se a ler uma base de dados mais recente:

```
pg_dump: error: server version: 17.6; pg_dump version: 15.4
pg_dump: error: aborting because of server version mismatch
```

Instalar na VPS (Debian/Ubuntu), a partir do repositório oficial do PostgreSQL — o das
distribuições costuma estar atrasado:

```bash
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update && sudo apt install -y postgresql-client-17

pg_dump --version    # tem de dizer 17.x
```

---

## Instalação do backup na VPS

Pressupõe os passos 0 a 3 de [KEEP_ALIVE_VPS.md](KEEP_ALIVE_VPS.md) feitos (utilizador
`pmplan`, `/etc/pmplan/`, `/var/log/pmplan/`).

```bash
export REPO=/opt/pmplan

# 1. Destino dos backups
sudo mkdir -p /var/backups/pmplan
sudo chown pmplan:pmplan /var/backups/pmplan
sudo chmod 750 /var/backups/pmplan

# 2. Configuração (contém a password da BD — 600, root:root)
sudo cp $REPO/deploy/backup/backup.env.example /etc/pmplan/backup.env
sudo chown root:root /etc/pmplan/backup.env
sudo chmod 600 /etc/pmplan/backup.env
sudo nano /etc/pmplan/backup.env        # preencher PGURL e alertas

# 3. Unidades
sudo chmod +x $REPO/scripts/backup-supabase.sh
sudo cp $REPO/deploy/backup/pmplan-backup.service /etc/systemd/system/
sudo cp $REPO/deploy/backup/pmplan-backup.timer   /etc/systemd/system/
sudo cp $REPO/deploy/backup/pmplan-backup.logrotate /etc/logrotate.d/pmplan-backup
sudo systemctl daemon-reload

# 4. Primeira execução, à mão
sudo systemctl start pmplan-backup.service
sudo journalctl -u pmplan-backup.service -n 30 --no-pager
ls -lh /var/backups/pmplan/daily/

# 5. Activar
sudo systemctl enable --now pmplan-backup.timer
systemctl list-timers 'pmplan-*' --no-pager
```

**Fazer o teste de restauro (secção acima) logo a seguir ao primeiro backup**, e
preencher a tabela de registo. É o único passo que transforma isto de plano em garantia.

---

## Cópia fora da VPS

Os backups estão na VPS. Se a VPS arder, ardem com ela — e o requisito era ter cópia
**fora do Supabase**, que está cumprido, mas continua a haver um único sítio.

Para o resolver, com 12 MB por dump, qualquer coisa serve: `rclone sync` para um bucket
S3/Backblaze, ou `rsync` para outra máquina. **Não está implementado** — se quiser, é um
acrescento pequeno ao script.
