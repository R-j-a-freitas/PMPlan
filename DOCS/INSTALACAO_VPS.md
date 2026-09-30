# Instalação da VPS — do zero ao `https://pmplan.net`

Passo a passo para pôr o PMPlan a servir numa VPS nova, com o domínio `pmplan.net` na
Cloudflare. No fim deste guia a VPS:

- serve a aplicação em `https://pmplan.net` (Caddy → `serve` sob `pm2`, via [deploy.sh](../deploy.sh));
- corre o keep-alive, o verificador de falhas e o backup diário do Supabase;
- aceita apenas SSH com chave, tem firewall, fail2ban e actualizações de segurança automáticas.

**Máquina de referência:** OVHcloud VPS-1 2027 — 2 vCPU, 4 GB RAM, 40 GB NVMe, Ubuntu 26.04,
datacenter na UE. O guia serve para qualquer Ubuntu 24.04/26.04.

**Arquitectura:**

```
browser ──HTTPS──► Cloudflare (proxy, laranja) ──HTTPS──► Caddy :443 ──► serve :8080 (pm2) ──► dist/
   │
   └──────────────── HTTPS directo ─────────────────────► Supabase (BD, auth, storage, funções)
```

A VPS só entrega ficheiros estáticos. Os dados continuam a ir do browser directamente
ao Supabase.

---

## 0. Antes de começar (no PC)

1. **Fazer commit e push de tudo o que deve ir para produção.** A VPS clona do GitHub:
   o que estiver só no PC não chega lá.
2. Ter à mão:
   - o **IPv4 e o IPv6** da VPS (email da OVH, ou painel → VPS → *Rede*);
   - o `.env` local (chaves do Supabase e da MSAL);
   - o `.env.heartbeat-token` e o `.env.resend` locais (keep-alive e alertas);
   - a **password da base de dados** do Supabase (para o backup).
3. Uma **chave SSH** no PC. Se ainda não existe (PowerShell):

   ```powershell
   ssh-keygen -t ed25519 -C "rjafreitas@pc"
   # aceitar o caminho por omissão; pôr uma passphrase
   Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub   # é isto que se cola onde pedirem a chave pública
   ```

Nos comandos abaixo, `IP` é o IPv4 da VPS.

---

## 1. Primeiro acesso

A OVH cria o utilizador **`ubuntu`**, com `sudo`. Se a chave SSH foi posta na encomenda:

```powershell
ssh ubuntu@IP
```

Se não foi, a OVH envia uma password por email. Entrar com ela e instalar a chave a
partir do PC (PowerShell):

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | ssh ubuntu@IP "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Sair e voltar a entrar: **tem de entrar sem pedir a password da VPS** (só a passphrase da
chave, se lhe pôs uma). Não avançar sem isto — o passo 3 desliga as passwords.

---

## 2. Sistema base

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git curl ca-certificates gnupg ufw fail2ban unattended-upgrades lsof

sudo hostnamectl set-hostname pmplan
sudo timedatectl set-timezone UTC          # os timers do keep-alive e do backup contam com UTC
timedatectl | grep "Time zone"             # → Etc/UTC

# Actualizações de segurança automáticas (responder "Yes")
sudo dpkg-reconfigure -plow unattended-upgrades
```

**Swap de 2 GB.** Com 4 GB de RAM, o `npm run build` (tsc + vite) pode ter picos; a swap
evita que o sistema mate o processo a meio.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h                                    # a linha Swap deve mostrar 2.0Gi
```

Se o `full-upgrade` actualizou o kernel: `sudo reboot` e voltar a entrar.

---

## 3. SSH só com chave

O ficheiro chama-se `00-…` de propósito: o `sshd` fica com o **primeiro** valor que lê, e
a imagem da OVH costuma trazer um `50-cloud-init.conf` com `PasswordAuthentication yes`.
Um `99-…` perdia para ele.

```bash
sudo tee /etc/ssh/sshd_config.d/00-pmplan.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF

sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T | grep -Ei '^(passwordauthentication|permitrootlogin)'
# → passwordauthentication no
# → permitrootlogin no
```

**Sem fechar esta sessão**, abrir outro terminal no PC e confirmar que `ssh ubuntu@IP`
continua a entrar. Se não entrar, corrigir na sessão que ficou aberta.

O `fail2ban` já vem com a protecção do SSH activa. Confirmar:

```bash
sudo fail2ban-client status sshd
```

---

## 4. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

A porta 8080 (o `serve`) fica fechada ao exterior: só o Caddy, na própria máquina, lhe
acede.

---

## 5. IPv6 — confirmar antes do backup

O backup liga-se à base de dados. A ligação **directa** do Supabase
(`db.<ref>.supabase.co`) só existe em IPv6.

```bash
ip -6 addr show scope global               # deve listar um endereço 2001:…
curl -6 -sI https://ifconfig.co | head -1  # deve dar HTTP/…200
```

- **Funciona** → no passo 10 pode usar a ligação directa.
- **Não funciona** → activar o IPv6 no painel da OVH, ou usar no passo 10 o
  *Session pooler* do Supabase (IPv4), como explica o [backup.env.example](../deploy/backup/backup.env.example).

---

## 6. Node.js e pm2

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version                             # v24.x
command -v node                            # /usr/bin/node — é o caminho que as unidades systemd assumem

sudo npm install -g pm2
pm2 startup systemd                        # imprime um comando "sudo env PATH=…" — copiar e correr esse comando
```

---

## 7. Código em `/opt/pmplan`

Chave de leitura só para este repositório (*deploy key*), para a VPS não precisar da sua
conta do GitHub:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_pmplan -N "" -C "vps-pmplan"
cat ~/.ssh/github_pmplan.pub
```

No GitHub: repositório **PMPlan → Settings → Deploy keys → Add deploy key**. Colar a
chave, título `vps-pmplan`, **sem** marcar *Allow write access*.

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_pmplan
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com                      # responder "yes"; deve dizer "successfully authenticated"

sudo mkdir -p /opt/pmplan
sudo chown ubuntu:ubuntu /opt/pmplan
git clone git@github.com:R-j-a-freitas/PMPlan.git /opt/pmplan
```

**O `.env`.** Copiar o do PC (PowerShell, na pasta do projecto):

```powershell
scp .env ubuntu@IP:/opt/pmplan/.env
```

Na VPS, mudar a URL pública — é o `redirectUri` do login Microsoft e a base dos links
nos eventos do Outlook:

```bash
cd /opt/pmplan
chmod 600 .env
nano .env
#   VITE_APP_URL=https://pmplan.net
```

---

## 8. Primeiro deploy

```bash
cd /opt/pmplan
chmod +x deploy.sh
./deploy.sh
```

Termina com `A correr sob pm2`. Confirmar e fixar o arranque automático:

```bash
pm2 status                                 # pmplan → online
curl -sI http://localhost:8080 | head -1   # HTTP/1.1 200 OK
pm2 save
```

**Deploys seguintes:** `cd /opt/pmplan && ./deploy.sh`. Só isto.

---

## 9. Domínio e HTTPS (Cloudflare + Caddy)

O modelo escolhido: **Cloudflare em modo proxy (nuvem laranja) + certificado de origem da
Cloudflare no Caddy + SSL "Full (strict)"**. O certificado de origem dura 15 anos: não há
renovações que possam falhar, e o IP da VPS não fica à vista.

### 9.1 DNS na Cloudflare

*pmplan.net → DNS → Records.* Primeiro **ver o que já existe** para `pmplan.net` (`@`) e
para `www`: se houver um `A`, `AAAA` ou `CNAME` antigo nesses nomes, editar em vez de
duplicar. **Não mexer** nos registos `MX` e `TXT` — são os emails da Resend
(ver [EMAILS_E_RESEND.md](EMAILS_E_RESEND.md)).

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| `A` | `@` | IPv4 da VPS | Proxied (laranja) |
| `AAAA` | `@` | IPv6 da VPS | Proxied (laranja) |
| `CNAME` | `www` | `pmplan.net` | Proxied (laranja) |

### 9.2 Modo SSL

- *SSL/TLS → Overview* → **Full (strict)**.
- *SSL/TLS → Edge Certificates* → **Always Use HTTPS** ligado.

### 9.3 Certificado de origem

*SSL/TLS → Origin Server → Create Certificate*: deixar os valores por omissão (chave RSA,
`*.pmplan.net` e `pmplan.net`, 15 anos) → **Create**. A página mostra dois blocos de
texto. **A chave privada só é mostrada uma vez** — não fechar a página antes do passo
seguinte.

Na VPS:

```bash
sudo mkdir -p /etc/caddy/certs
sudo nano /etc/caddy/certs/pmplan.net.pem  # colar o "Origin Certificate"
sudo nano /etc/caddy/certs/pmplan.net.key  # colar a "Private Key"
```

As permissões ficam para o fim do passo 9.4, depois de o pacote do Caddy ter criado o
grupo `caddy`.

### 9.4 Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo chown root:caddy /etc/caddy/certs/pmplan.net.*
sudo chmod 640 /etc/caddy/certs/pmplan.net.*
```

Substituir o `/etc/caddy/Caddyfile` por:

```bash
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
(origem_cloudflare) {
	tls /etc/caddy/certs/pmplan.net.pem /etc/caddy/certs/pmplan.net.key
}

www.pmplan.net {
	import origem_cloudflare
	redir https://pmplan.net{uri} permanent
}

pmplan.net {
	import origem_cloudflare
	encode zstd gzip

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}

	# Os ficheiros em /assets/ têm hash no nome: podem ficar em cache para sempre.
	# Todo o resto (index.html, sw.js, manifest) tem de ser revalidado, senão a PWA
	# e a Cloudflare continuam a servir a versão antiga depois de um deploy.
	@hashed path /assets/*
	header @hashed >Cache-Control "public, max-age=31536000, immutable"
	@mutable not path /assets/*
	header @mutable >Cache-Control "no-cache"

	reverse_proxy localhost:8080
}
EOF

sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### 9.5 Verificar

```bash
curl -sI https://pmplan.net | head -1                          # HTTP/2 200
curl -sI https://www.pmplan.net | grep -i '^location'          # → https://pmplan.net/
```

E abrir `https://pmplan.net` no browser: a página de login deve aparecer, com cadeado.

---

## 10. Serviços fora da VPS que precisam de saber o novo endereço

Sem isto a página abre, mas o login Microsoft e os links dos emails apontam para o sítio
errado.

1. **Microsoft Entra ID** (portal Azure) → *App registrations* → a app do PMPlan →
   *Authentication* → plataforma **Single-page application** → acrescentar o Redirect URI
   `https://pmplan.net`. Manter o `http://localhost:5173` para desenvolvimento.
2. **Supabase** → *Authentication → URL Configuration*:
   - *Site URL*: `https://pmplan.net`
   - *Redirect URLs*: acrescentar `https://pmplan.net/**`
3. **Link "Iniciar sessão" no email de reposição de password** — segredo das Edge
   Functions (no PC, na pasta do projecto):

   ```powershell
   npx supabase secrets set APP_URL=https://pmplan.net
   ```

Testar: login com conta Microsoft, e um pedido de reposição de password para uma conta
de teste.

---

## 11. Keep-alive, verificador e backup

Tudo já está escrito — seguir pela ordem:

1. **Keep-alive e verificador:** [KEEP_ALIVE_VPS.md → Instalação](KEEP_ALIVE_VPS.md#instalação),
   passos 0 a 7. O token do heartbeat é o que está no `.env.heartbeat-token` do PC (não
   é preciso cunhar outro). A chave e o remetente da Resend estão no `.env.resend`.
2. **Ferramentas do PostgreSQL 17:** [DISASTER_RECOVERY.md → Requisitos das ferramentas](DISASTER_RECOVERY.md#requisitos-das-ferramentas).
3. **Backup:** [DISASTER_RECOVERY.md → Instalação do backup na VPS](DISASTER_RECOVERY.md#instalação-do-backup-na-vps).
   No `PGURL`, usar a ligação directa ou o pooler conforme o resultado do passo 5.
4. **Teste de restauro** logo a seguir ao primeiro backup ([DISASTER_RECOVERY.md → Teste de restauro](DISASTER_RECOVERY.md#teste-de-restauro)),
   e preencher a tabela de registo. Feito a 2026-09-30 — ver o registo nesse documento.

No fim:

```bash
systemctl list-timers 'pmplan-*' --no-pager
# três timers: keepalive (04–07h), heartbeat-check (10–11h), backup (02–03h)
```

---

## 12. Lista final

- [ ] `ssh ubuntu@IP` entra só com chave; `ssh` com password é recusado
- [ ] `sudo ufw status` → só 22, 80 e 443 abertas
- [ ] `timedatectl` → UTC
- [ ] `pm2 status` → `pmplan` online; depois de `sudo reboot` volta sozinho
- [ ] `https://pmplan.net` abre com cadeado; `www` redirecciona
- [ ] Login Microsoft funciona em `https://pmplan.net`
- [ ] Email de reposição de password tem o link certo
- [ ] Três timers `pmplan-*` activos
- [x] Primeiro backup em `/var/backups/pmplan/daily/` e **teste de restauro feito**
- [ ] *Saúde do sistema* na app mostra a origem `vps` no heartbeat, no dia seguinte

---

## Riscos conhecidos

- **Backups só na VPS.** Se a VPS se perder, os `pg_dump` perdem-se com ela. O backup
  automático da OVH (snapshot diário da máquina) atenua, mas está no mesmo fornecedor.
  A cópia para fora continua por implementar — ver [DISASTER_RECOVERY.md → Cópia fora da VPS](DISASTER_RECOVERY.md#cópia-fora-da-vps).
- **Certificado de origem.** Só é válido através da Cloudflare. Se algum dia se desligar
  o proxy (nuvem cinzenta), os browsers recusam o certificado — nesse caso trocar o
  `tls …` do Caddyfile por nada (o Caddy passa a pedir certificado ao Let's Encrypt
  sozinho).
- **Validade de 15 anos** do certificado de origem e de **5 anos** do token do heartbeat
  — ambos esquecíveis. Pôr lembretes no calendário.
