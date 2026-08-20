# Keep-alive do Supabase na VPS — instalação e operação

Instala o heartbeat diário que impede o projecto Supabase de ser pausado por
inactividade. Corre na VPS Hetzner, escrito de fora do Supabase de propósito: um projecto
pausado não executa os seus próprios jobs, portanto o mecanismo que o mantém vivo não pode
viver lá dentro.

O que corre a cada execução, por esta ordem:

1. `INSERT` em `system_heartbeat` com `source = 'vps'`
2. `SELECT count(*)` em `pm_events` — tabela real do domínio, não a de heartbeats
3. purga dos registos antigos (mantém os 90 mais recentes)

Escrita e leitura reais contam como actividade de base de dados; um pedido HTTP a um
endpoint de saúde não conta — é servido pelo GoTrue e nunca chega ao Postgres.

**Pré-requisito de schema:** migrações `0010_system_heartbeat.sql` e
`0011_heartbeat_least_privilege.sql` aplicadas.

---

## A credencial — ler antes de começar

A VPS **não** recebe a `service_role` key. Recebe um token de um papel Postgres dedicado,
`pmplan_heartbeat` (migração 0011), com exactamente três capacidades:

| Consegue | Não consegue |
|---|---|
| `INSERT` em `system_heartbeat` | Ler `pm_events`, `hospitals`, `user_profiles`, `equipment` — ou qualquer outra tabela |
| Contar PMs (só o número, via função) | Ler os próprios heartbeats que escreve |
| Disparar a purga | Alterar ou apagar seja o que for |
| | Executar `exec_sql` ou promover-se a outro papel |

Verificado contra as 17 tabelas do schema: **um único privilégio, `INSERT` em
`system_heartbeat`**. Ao contrário da `service_role`, este papel não tem `BYPASSRLS`.

O token continua a ser um segredo — quem o obtenha pode escrever heartbeats falsos, e isso
mascararia uma paragem real (o painel da Fase 5 mostraria verde com a VPS morta). Mas não
expõe um único dado de cliente, hospital ou utilizador.

Mitigações aplicadas nos ficheiros entregues:

- ficheiro de ambiente `root:root` com modo `600`, fora do repositório
- o systemd lê o ficheiro como root e só depois baixa privilégios para `pmplan`, pelo que
  o utilizador do serviço nunca consegue ler o token do disco
- unidade endurecida (`ProtectSystem=strict`, `NoNewPrivileges`, `SystemCallFilter`, …)
- o token nunca é escrito no log — os erros incluem o corpo da resposta, nunca os headers

**Modo legado.** O script ainda aceita `SUPABASE_SERVICE_ROLE_KEY` se o token não estiver
definido, mas escreve um `WARN` em cada execução. Serve para desbloquear uma instalação, não
para ficar. O `WARN` diário é intencional.

### Gerar o token

Numa máquina de confiança — **não na VPS**, que nunca deve conhecer o JWT secret:

```bash
SUPABASE_JWT_SECRET='<Project Settings → API → JWT Secret>' \
SUPABASE_PROJECT_REF='<ref do projecto>' \
node scripts/mint-heartbeat-token.mjs
```

O token sai em `stdout`; o resto vai para `stderr`, para poder redireccionar. Validade por
omissão: 5 anos (`TOKEN_YEARS` altera).

O JWT secret assina também as chaves `anon` e `service_role` — quem o tiver pode cunhar um
token de qualquer papel, incluindo `service_role`. Guarde-o onde já guarda os outros
segredos do projecto e **nunca** o coloque na VPS: lá só vai parar o token produzido aqui.

### Rotação e revogação

Voltar a correr o script gera um token novo; substituí-lo no `/etc/pmplan/keep-alive.env`
(e no GitHub Secret da Fase 3) é toda a rotação.

Para **revogar** um token comprometido não basta gerar outro — o antigo continua válido até
expirar. Como não há lista de revogação, retire-lhe o alcance:

```sql
revoke insert on system_heartbeat from pmplan_heartbeat;
revoke execute on function purge_system_heartbeat(), heartbeat_domain_check() from pmplan_heartbeat;
```

Isto inutiliza *todos* os tokens do papel de uma vez, incluindo o legítimo. Depois volte a
conceder e cunhe um token novo. Rodar o JWT secret do projecto também os invalida, mas
invalida ao mesmo tempo as chaves `anon` e `service_role` — obriga a redeploy da aplicação.

---

## Instalação

Os comandos assumem o repositório em `/opt/pmplan` e Debian/Ubuntu. Ajustar conforme a
sua VPS — em especial `REPO`, que deve apontar para o clone que o `deploy.sh` já usa.

### 0. Verificações prévias

```bash
export REPO=/opt/pmplan          # ajustar ao caminho real do clone

node --version                   # tem de ser >= 18 (o script não tem dependências)
command -v node                  # guardar o caminho: é preciso na unidade de serviço
timedatectl | grep "Time zone"   # confirmar UTC — ver nota no fim
ls $REPO/scripts/keep-alive.mjs  # confirmar que o git pull já trouxe o script
```

Se o `node` não estiver em `/usr/bin/node`, corrigir o `ExecStart` no passo 4.

### 1. Utilizador de sistema dedicado

Sem shell e sem home: este utilizador serve só para correr o heartbeat.

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin pmplan
```

### 2. Ficheiro de configuração (fora do repositório)

```bash
sudo mkdir -p /etc/pmplan
sudo cp $REPO/deploy/keepalive/keep-alive.env.example /etc/pmplan/keep-alive.env
sudo chown root:root /etc/pmplan/keep-alive.env
sudo chmod 600 /etc/pmplan/keep-alive.env
sudo nano /etc/pmplan/keep-alive.env      # preencher URL, token do heartbeat e anon key
```

Preencher `SUPABASE_URL`, `SUPABASE_HEARTBEAT_TOKEN` (gerado acima) e `SUPABASE_ANON_KEY`.
Deixar `SUPABASE_SERVICE_ROLE_KEY` comentada.

Confirmar o resultado — deve mostrar `-rw------- root root`:

```bash
sudo ls -l /etc/pmplan/keep-alive.env
```

### 3. Directório de logs

```bash
sudo mkdir -p /var/log/pmplan
sudo chown pmplan:pmplan /var/log/pmplan
sudo chmod 750 /var/log/pmplan
```

### 4. Unidades systemd e rotação de logs

```bash
sudo cp $REPO/deploy/keepalive/pmplan-keepalive.service /etc/systemd/system/
sudo cp $REPO/deploy/keepalive/pmplan-keepalive.timer   /etc/systemd/system/
sudo cp $REPO/deploy/keepalive/pmplan-keepalive.logrotate /etc/logrotate.d/pmplan-keepalive
```

Se o repositório **não** estiver em `/opt/pmplan`, ou o Node não estiver em
`/usr/bin/node`, ajustar agora:

```bash
sudo nano /etc/systemd/system/pmplan-keepalive.service
#   ExecStart=<caminho-do-node> <REPO>/scripts/keep-alive.mjs
#   WorkingDirectory=<REPO>
#   ReadWritePaths=/var/log/pmplan     (só mudar se alterou KEEPALIVE_LOG)

sudo systemctl daemon-reload
```

Validar a sintaxe do logrotate sem rodar nada:

```bash
sudo logrotate --debug /etc/logrotate.d/pmplan-keepalive
```

### 5. Execução de teste

Correr **uma vez, à mão**, antes de activar o calendário:

```bash
sudo systemctl start pmplan-keepalive.service
sudo systemctl status pmplan-keepalive.service
```

Um `Active: inactive (dead)` com `status=0/SUCCESS` é o resultado correcto — a unidade é
`oneshot` e termina. Confirmar o que ela fez:

```bash
sudo journalctl -u pmplan-keepalive.service -n 20 --no-pager
sudo cat /var/log/pmplan/keep-alive.log
```

Deve ver as três etapas, e `papel=pmplan_heartbeat`:

```
… [INFO] keep-alive a arrancar (source=vps, papel=pmplan_heartbeat, alvo=https://….supabase.co)
… [INFO] a. heartbeat inserido
… [INFO] b. pm_events contadas: 50
… [INFO] c. purga concluída (0 registo(s) removido(s))
… [INFO] keep-alive OK em 644ms
```

Se aparecer `papel=service_role` e um `WARN`, o `SUPABASE_HEARTBEAT_TOKEN` não foi lido —
confirmar o ficheiro de ambiente.

**Não avançar sem esta saída.** Se falhar, ver o diagnóstico mais abaixo.

### 6. Activar o timer

```bash
sudo systemctl enable --now pmplan-keepalive.timer
systemctl list-timers pmplan-keepalive.timer --no-pager
```

O `NEXT` deve cair entre as 04:00 e as 07:00 do dia seguinte — a janela é o
`RandomizedDelaySec=3h`, e é normal mudar a cada consulta.

### 7. Verificador de falhas (recomendado)

O verificador avisa por email quando o heartbeat pára ou quando o Supabase deixa de
responder. Corre também no GitHub Actions (Fase 3) — instalá-lo aqui é o que garante que
a detecção sobrevive à desactivação automática dos schedules do GitHub.

Acrescentar ao `/etc/pmplan/keep-alive.env`:

```bash
sudo nano /etc/pmplan/keep-alive.env
#   RESEND_API_KEY=…
#   ALERT_EMAIL_TO=…
#   RESEND_FROM_EMAIL=…   (domínio verificado no Resend)
```

Instalar e testar:

```bash
sudo cp $REPO/deploy/keepalive/pmplan-heartbeat-check.service /etc/systemd/system/
sudo cp $REPO/deploy/keepalive/pmplan-heartbeat-check.timer   /etc/systemd/system/
sudo systemctl daemon-reload

sudo systemctl start pmplan-heartbeat-check.service
sudo journalctl -u pmplan-heartbeat-check.service -n 20 --no-pager
```

Com tudo bem, termina em `status=0/SUCCESS` e regista `OK — heartbeat mais recente tem
Xh`. **Sair com 1 é o comportamento correcto quando alerta** — a unidade fica marcada
como `failed` de propósito, para o problema ser visível no `systemctl status`.

Para confirmar que o email sai mesmo, forçar um alerta com um limite impossível:

```bash
sudo systemctl set-environment HEARTBEAT_MAX_AGE_HOURS=0   # temporário
sudo systemctl start pmplan-heartbeat-check.service        # deve chegar um email
sudo systemctl unset-environment HEARTBEAT_MAX_AGE_HOURS
```

Activar:

```bash
sudo systemctl enable --now pmplan-heartbeat-check.timer
systemctl list-timers 'pmplan-*' --no-pager
```

Devem aparecer os dois timers: o ping entre as 04:00 e as 07:00, a verificação entre as
10:00 e as 11:00.

---

## Redundância no GitHub Actions

O workflow [.github/workflows/keepalive.yml](../.github/workflows/keepalive.yml) corre os
mesmos dois scripts às 16:00 UTC — verificação primeiro, ping depois. A ordem é
deliberada: se pingasse primeiro, o próprio heartbeat tornaria o agregado fresco e a
verificação passaria sempre, mesmo com a VPS morta há uma semana.

Configurar em *Settings → Secrets and variables → Actions → New repository secret*:

| Secret | Valor |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | chave anon (pública, mas o workflow precisa dela) |
| `SUPABASE_HEARTBEAT_TOKEN` | token gerado com `mint-heartbeat-token.mjs` — **o mesmo da VPS ou outro, indiferente** |
| `RESEND_API_KEY` | chave da API do Resend |
| `ALERT_EMAIL_TO` | destinatário(s) do alerta, separados por vírgula |
| `RESEND_FROM_EMAIL` | remetente, num domínio verificado no Resend |

Testar sem esperar pelo horário: separador *Actions* → *Supabase keep-alive* → **Run
workflow**. Deve terminar a verde, e a tabela passa a ter uma linha `github_actions`.

**Limitação que não é contornável:** o GitHub desactiva schedules em repositórios sem
commits há 60 dias. Ver a secção correspondente no [README](../README.md#continuidade-da-base-de-dados)
— é a razão de o keep-alive da VPS ser o mecanismo principal e não a redundância.

---

## Verificação manual a partir da aplicação

*Saúde do sistema* → **Verificar agora** (só admin) faz as mesmas três etapas desta
página, mas de dentro do browser e com `source = 'manual'`: escreve o heartbeat, conta as
PMs e purga. Passa pela função `run_system_check()` da migração
`0018_manual_health_actions.sql` — a aplicação continua sem privilégio para escrever
directamente em `system_heartbeat`, e o token do papel `pmplan_heartbeat` continua a viver
só na VPS e no GitHub Actions.

Serve para responder já a "a base de dados está viva?" e para adiar a contagem dos 7 dias
enquanto se resolve uma avaria da VPS. **Não é um mecanismo**: depende de alguém se
lembrar, e por isso o semáforo global do ecrã ignora a origem `manual` — se a contasse, um
clique bastava para pintar de verde um ecrã com as duas origens automáticas paradas.

---

## Operação

```bash
# Quando corre a seguir e quando correu da última vez
systemctl list-timers pmplan-keepalive.timer --no-pager

# Correr agora, fora de horas (não altera o calendário)
sudo systemctl start pmplan-keepalive.service

# Histórico das execuções
sudo journalctl -u pmplan-keepalive.service --since "7 days ago" --no-pager

# Só as falhas
sudo journalctl -u pmplan-keepalive.service -p err --no-pager
```

Confirmar do lado do Supabase (SQL Editor, como admin):

```sql
select source, max(pinged_at) as ultimo,
       round(extract(epoch from now() - max(pinged_at)) / 3600, 1) as horas
from system_heartbeat group by source order by source;
```

---

## Diagnóstico

| Sintoma | Causa provável | Resolução |
|---|---|---|
| `HTTP 401 — Invalid API key` | `SUPABASE_ANON_KEY` errada ou truncada | Reconfirmar em Project Settings → API. O gateway valida o `apikey`, não o token. |
| `HTTP 401 — JWSError` / `invalid signature` | token cunhado com o JWT secret errado | Voltar a correr `mint-heartbeat-token.mjs` com o segredo certo. |
| `HTTP 401 — JWT expired` | token passou a validade | Cunhar um novo (`TOKEN_YEARS`) e substituir no `.env`. |
| `HTTP 403 — permission denied for table system_heartbeat` | migração 0011 não aplicada, ou grants revogados | Aplicar `0011_heartbeat_least_privilege.sql`. |
| `HTTP 404` no INSERT | migração 0010 não aplicada | Aplicar `supabase/migrations/0010_system_heartbeat.sql`. |
| `HTTP 404` no `heartbeat_domain_check` | migração 0011 não aplicada | Aplicar `0011_heartbeat_least_privilege.sql`. |
| `HTTP 400 … violates check constraint` | `HEARTBEAT_SOURCE` fora de `vps`/`github_actions`/`manual` | Corrigir o `.env`. Maiúsculas contam. |
| `fetch failed` repetido | sem rede, ou projecto pausado | Testar `curl -sI $SUPABASE_URL/auth/v1/health`. Se o projecto estiver pausado, tem de ser restaurado no dashboard — nenhum script o consegue reanimar de fora. |
| `WARN log em ficheiro desactivado` | `/var/log/pmplan` inexistente ou sem permissões | Repetir o passo 3. O heartbeat em si não falhou. |
| `status=203/EXEC` | caminho do Node errado no `ExecStart` | `command -v node` e corrigir a unidade. |
| `status=226/NAMESPACE` | `ReadWritePaths` aponta para caminho inexistente | Criar o directório ou corrigir a unidade. |
| Node não arranca, erro de memória | `MemoryDenyWriteExecute=true` acrescentado | Retirar. O V8 compila em tempo de execução e precisa de páginas W+X. |
| Timer activo mas nunca dispara | VPS desligada à hora marcada | `Persistent=true` já cobre isto — a execução em falta corre no arranque seguinte. Confirmar com `list-timers`. |

**Fuso horário.** O `OnCalendar` usa o fuso do sistema. Se a VPS não estiver em UTC, o
desfasamento face ao GitHub Actions da Fase 3 deixa de ser o planeado — as duas origens
podem acabar a disparar quase à mesma hora, o que anula metade do valor da redundância.
Verificar com `timedatectl`; para normalizar: `sudo timedatectl set-timezone UTC`.

---

## Actualizar o script

O script vive no repositório, portanto acompanha o `deploy.sh`:

```bash
cd $REPO && git pull
```

Não é preciso `daemon-reload` — a unidade aponta para o ficheiro, que foi actualizado no
sítio. Só é preciso se alterar os ficheiros `.service` ou `.timer`, e nesse caso é preciso
voltar a copiá-los para `/etc/systemd/system/`.

## Desinstalar

```bash
sudo systemctl disable --now pmplan-keepalive.timer
sudo rm /etc/systemd/system/pmplan-keepalive.{service,timer}
sudo rm /etc/logrotate.d/pmplan-keepalive
sudo systemctl daemon-reload
sudo rm -rf /etc/pmplan            # contém a chave — apagar mesmo
```

O utilizador `pmplan`, os logs em `/var/log/pmplan` e a tabela `system_heartbeat` ficam.
Removê-los é decisão à parte.
