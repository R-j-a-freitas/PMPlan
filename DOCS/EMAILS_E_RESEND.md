# Emails e configuração da Resend

Tudo o que o PMPlan envia e recebe por email, e como está montado do lado da Resend e do
DNS. Para o detalhe do arquivo de documentos assinados, ver
**[DOCUMENTOS_ASSINADOS.md](DOCUMENTOS_ASSINADOS.md)**.

---

## 1. Quem recebe o quê

Três etapas, com regras diferentes. Todas são enviadas de
`PMPlan - Elekta <noreply@pmplan.net>` e existem em versão **PT e ES**, escolhida pelo
`country` do hospital — nunca uma versão única.

Cada etapa tem ainda um template por **via de aprovação**: a via geral usa
`engineer_approval` / `client_proposal` / `signature_letter`, e a da braquiterapia os
`brachy_*` correspondentes (migração `0017`). São seis templates × dois idiomas, todos
editáveis em *Aprovações → Templates das aprovações*. Ver
**[APROVACOES_BRAQUITERAPIA.md](APROVACOES_BRAQUITERAPIA.md)**.

| | `engineer_approval` | `client_proposal` | `signature_letter` |
|---|---|---|---|
| **Para** | engenheiros das PMs | contactos do hospital | contactos do hospital |
| **CC** | quem envia + CC fixos activos | + Team Leader da zona | + Team Leader da zona |
| **Reply-To** | `EMAIL_REPLY_TO_DEFAULT` | `EMAIL_REPLY_TO_DEFAULT` | quem envia + CC fixos activos + `documentos@pmplan.net` |
| **Anexos** | — | — | PDF da carta + `.ics` |
| **Assunto** | normal | normal | acrescido de `[PM-XXXXXXXX]`, ou `[BT-XXXXXXXX]` na via da braquiterapia |

Notas que não se deduzem da tabela:

- **O TL só entra nos emails ao cliente.** O de validação ao engenheiro é interno e não
  passa por ele. Quem for TL da zona *e* engenheiro das PMs não recebe duas vezes — a
  lista é desduplicada.
- **Estar em CC não faz receber respostas.** Uma resposta do cliente vai para o `Reply-To`,
  não para os CCs do email original. É por isso que os destinatários fixos activos (hoje,
  a Teresa) estão *também* no `Reply-To` da carta de assinatura: para verem os documentos
  assinados a chegar, e não só o pedido que os originou.
- **A caixa de documentos vai só em `Reply-To`, nunca em CC.** Em CC, a Resend entregava-nos
  a nossa própria carta (o inbound é catch-all) e o arquivo ficava com o PDF *em branco* ao
  lado do assinado, com o mesmo nome de ficheiro.

### Interruptores

Ambos em **Aprovações → Destinatários em CC**, ambos gravados na base de dados:

| Interruptor | Efeito |
|---|---|
| **Ativo** (por pessoa, `email_recipients.active`) | Tira a pessoa do CC dos envios **e** do Reply-To da carta |
| **Incluir os Team Leaders das zonas** (`app_settings`) | Tira todos os TLs do CC dos emails a clientes |

Servem para testar sem incomodar ninguém. Ligados por omissão: desligar é a excepção
temporária, e uma definição por carregar nunca é interpretada como "não enviar".

O TL de cada zona define-se em **Configurações → Zonas → Editar**. As zonas-filhas herdam
o TL da zona-mãe, por isso basta defini-lo em `North & West` e `South & Eastern Spain`.

---

## 2. Configuração na Resend

**Domínio:** `pmplan.net` · **Região:** `eu-west-1` (Irlanda) · **DNS:** Cloudflare

A região importa: os hostnames da AWS por trás da Resend são regionais, e um registo de
outra região não funciona.

### Registos DNS

| Tipo | Nome | Prioridade | Valor | Para quê |
|---|---|---|---|---|
| TXT | `resend._domainkey` | — | `p=MIGfMA0GCS…` | DKIM (verificação do domínio) |
| MX | `send` | 10 | `feedback-smtp.eu-west-1.amazonses.com` | bounces do que enviamos |
| TXT | `send` | — | `v=spf1 include:amazonses.com ~all` | SPF |
| MX | `@` | 10 | `inbound-smtp.eu-west-1.amazonaws.com` | **receber** emails |
| TXT | `_dmarc` | — | `v=DMARC1; p=none;` | política DMARC |

Três armadilhas que já custaram tempo:

1. **`feedback-smtp` ≠ `inbound-smtp`.** O primeiro (`…amazonses.com`) é para onde a AWS
   entrega bounces do que *enviamos*. O segundo (`…amazonaws.com`) é para onde o mundo
   entrega o que *recebemos*. Nomes parecidos, domínios diferentes, funções opostas.
2. **São dois registos, em nomes diferentes.** O de envio vive em `send`, o de receção em
   `@`. Editar o de envio para lhe pôr o valor de receção parte os dois de uma vez — o
   domínio deixa de validar para envio e continua sem receber.
3. **O Email Routing da Cloudflare tem de estar desligado.** Se estiver ligado, ela impõe
   os MX dela na raiz e o inbound da Resend nunca chega. Não confundir com o proxy: a nuvem
   laranja não existe em MX nem TXT, não há nada a desligar aí.

Uma quarta, que era da Hetzner e aqui deixou de existir: o **ponto final no valor**. Num
DNS que trate o valor como relativo, `…amazonses.com` sem ponto vira
`…amazonses.com.pmplan.net`, um host que não existe. A Cloudflare trata sempre o valor MX
como absoluto, por isso no formulário dela escreve-se sem ponto. Num ficheiro BIND
importado, ao contrário, o ponto final é obrigatório.


### Porque é que o MX de receção está na raiz

A Resend recomenda usar um subdomínio, para não roubar o correio a quem já recebe email no
domínio. Aqui não há esse risco: o `pmplan.net` é dedicado ao PMPlan e não tem caixas de
correio nenhumas. Se algum dia passar a ter, move-se para um subdomínio (ex.
`docs.pmplan.net`) e actualiza-se o `SIGNED_DOCUMENTS_MAILBOX` nos dois sítios da secção 4.


### Receção é catch-all

Não se cria a caixa `documentos@`: activa-se a receção e **todos** os endereços
`@pmplan.net` passam a entregar ao webhook — incluindo respostas ao `noreply@`,
notificações e spam. A filtragem é feita na Edge Function, não na Resend.

### Webhook

| | |
|---|---|
| URL | `https://bwtodvouhjecjcuhfgvw.supabase.co/functions/v1/inbound-signed-document` |
| Evento | `email.received` (só este) |
| Assinatura | formato Svix, verificada por HMAC-SHA256 na função |

Não subscrever os eventos de saída (`email.sent`, `email.delivered`, …): a função ignora-os,
mas seria uma invocação por cada email enviado.

> **Os webhooks são da conta, não do domínio.** A Resend não filtra por domínio: cada
> endpoint subscrito a `email.received` recebe o correio de *todos* os domínios da conta. E
> a conta é partilhada com outro projecto, que tem o seu próprio endpoint
> (`iodeccrdasvokesaynoq…/email-inbound`) — logo os documentos assinados dos hospitais são
> entregues também lá, e o correio desse projecto chega também aqui. De cá, o filtro da
> função trata disso; do lado deles não temos controlo. É a razão de peso para separar as
> contas (ver "Ainda por fazer").


---

## 3. Edge Functions

| Função | Papel | Deploy |
|---|---|---|
| `send-proposal-email` | envia via Resend (retries, validação, anexos) | `supabase functions deploy send-proposal-email` |
| `inbound-signed-document` | recebe o webhook e arquiva os documentos | `… deploy inbound-signed-document --no-verify-jwt` |

O `--no-verify-jwt` só na segunda: quem a chama é a Resend, que não tem JWT do Supabase. A
autenticação dela é a assinatura do webhook. Sem `RESEND_WEBHOOK_SECRET` definido a função
recusa todos os pedidos, para nunca ficar um endpoint público a aceitar payloads forjados.

Como não existe `supabase/config.toml` neste repositório, todos os comandos levam
`--project-ref bwtodvouhjecjcuhfgvw`.

### Secrets

```bash
supabase secrets set NOME=valor --project-ref bwtodvouhjecjcuhfgvw
```

| Secret | Obrigatório | Valor actual / omissão |
|---|---|---|
| `RESEND_API_KEY` | sim | — |
| `RESEND_WEBHOOK_SECRET` | sim (receção) | `whsec_…` do painel da Resend |
| `RESEND_FROM_EMAIL` | não | `noreply@pmplan.net` |
| `RESEND_FROM_NAME` | não | `PMPlan - Elekta` |
| `EMAIL_REPLY_TO_DEFAULT` | não | `teresa.matos@elekta.com` |
| `SIGNED_DOCUMENTS_MAILBOX` | não | `documentos@pmplan.net` (lista separada por vírgulas) |

Os secrets são lidos em runtime — mudá-los não obriga a novo deploy.

---

## 4. Sítios onde o endereço da caixa de documentos aparece

O endereço do código tem de constar do secret. Se não constar, as respostas dos clientes
deixam de ser arquivadas **sem nenhum erro visível** — é a falha mais fácil de não dar por
ela.

1. `SIGNED_DOCUMENTS_MAILBOX` em [`src/lib/proposalEmail.ts`](../src/lib/proposalEmail.ts)
   — um endereço só, o que vai no `Reply-To` da carta.
2. Secret `SIGNED_DOCUMENTS_MAILBOX` da Edge Function (o filtro à entrada) — uma **lista
   separada por vírgulas**. Se não for definido, usa `documentos@pmplan.net`.

A lista existe por causa das mudanças de domínio. As cartas enviadas antes da mudança levam
a caixa antiga no `Reply-To`, e as respostas continuam a ir para lá durante semanas: com a
antiga na lista, continuam a ser arquivadas, e a guarda `isFromOurselves` continua a
reconhecer as nossas próprias cartas antigas. Hoje o secret vale
`documentos@pmplan.net,documentos@stockmate.pt`; a antiga sai quando já não chegar lá nada.


> **Aspas obrigatórias no PowerShell.** `supabase secrets set X=a,b` sem aspas chega ao
> servidor como `a b`: a vírgula é o operador de construção de arrays do PowerShell, que
> parte o argumento em dois. Já aconteceu — o secret ficou com um espaço em vez da vírgula
> e o filtro deixou de reconhecer qualquer destinatário, sem erro nenhum. O parser aceita
> hoje vírgula, ponto-e-vírgula ou espaço por causa disso, mas escreve-se sempre
> `supabase secrets set X="a,b"`. Para confirmar o que lá ficou: `supabase secrets list`
> mostra o SHA-256 do valor, que se compara com o do valor esperado.



---

## 5. Alterações feitas nesta ronda

### Base de dados

| Migração | O quê |
|---|---|
| `0014_zone_team_leaders` | `zones.team_leader_engineer_id` + seed do Gonçalo Martins em North & West |
| `0015_signed_documents` | tabela `signed_documents`, bucket privado `signed-documents`, `client_proposals.reference_code` |
| `0016_app_settings` | tabela `app_settings` chave/valor + `include_team_leaders_in_client_emails` |
| `0017_brachytherapy_approvals` | `client_proposals.approval_track` + `modalities.approval_track`, prefixo `BT-` no código de referência, 6 templates `brachy_*` |

### Aplicação

- **Domínio próprio `pmplan.net`**, com DNS na Cloudflare, em vez do `stockmate.pt`
  emprestado a outro projecto: `noreply@pmplan.net` no envio, `documentos@pmplan.net` na
  recepção. O `SIGNED_DOCUMENTS_MAILBOX` da Edge Function passou a aceitar uma lista de
  caixas (secção 4), para que as respostas às cartas enviadas antes da mudança continuem a
  ser arquivadas. A conta Resend ainda é a mesma de antes.
- **Team Leader por zona**, herdado pelas zonas-filhas, em CC dos emails a clientes.
  Coluna "Team Leader" na tabela de Aprovações mostra quem vai em cópia (riscado quando o
  interruptor está desligado, "Sem TL" a vermelho quando a zona não tem nenhum).
- **Reenviar carta para assinatura**, nos estados *Carta enviada* e *Assinado*. O PDF e o
  `.ics` são sempre regerados a partir das PMs actuais, por isso o cliente recebe o plano
  alterado. A partir de *Assinado* pede confirmação e volta o estado a *Carta enviada*,
  apagando a assinatura registada — que era de um plano que deixou de estar em vigor.
- **Arquivo de documentos assinados** na ficha do hospital, alimentado pelas respostas dos
  clientes. Ver [DOCUMENTOS_ASSINADOS.md](DOCUMENTOS_ASSINADOS.md).
- **Código de referência** `[PM-XXXXXXXX]` no assunto da carta, gerado por proposta
  (`[BT-XXXXXXXX]` na via da braquiterapia).
- **Via de aprovação independente para a Braquiterapia**: proposta, validação do engenheiro,
  aprovação do cliente, carta e assinatura próprias, separadas das do resto do hospital. Ver
  [APROVACOES_BRAQUITERAPIA.md](APROVACOES_BRAQUITERAPIA.md).
- **`graph_message_id`** passou a ser gravado no `email_log` — é o id que a Resend devolve,
  e permite cruzar um envio com o que se vê no painel dela quando algo corre mal.

### Ainda por fazer

- **Rodar o `RESEND_WEBHOOK_SECRET`.** O valor actual circulou fora do painel.
  Resend → Webhooks → ⋯ → *Roll secret*, depois `supabase secrets set`.
- **Juan Manuel Bravo** não existe como engenheiro, por isso a zona
  `South & Eastern Spain` está sem TL e os hospitais de Madrid aparecem como "Sem TL".
  Criar a ficha em Engenheiros e escolhê-lo em Configurações → Zonas.

---

## 6. Diagnóstico

| Sintoma | Onde olhar |
|---|---|
| Email não saiu | Resend → Emails (estado por mensagem) · `supabase functions logs send-proposal-email` |
| Documento assinado não apareceu | Resend → Webhooks → histórico de entregas (código devolvido pela função) |
| Webhook devolve 401 | Assinatura: `RESEND_WEBHOOK_SECRET` não bate certo com o do painel |
| Webhook devolve 500 | Secret em falta, ou nenhum anexo foi arquivado — ver logs |
| Webhook devolve 200 com `stored: 0` | Normal: email sem PDF, enviado por nós, ou não dirigido à caixa de documentos |

```bash
supabase functions logs inbound-signed-document --project-ref bwtodvouhjecjcuhfgvw
```

Verificar o DNS a partir de fora (a cache do resolver pode mascarar uma alteração recente —
os registos têm TTL 1800):

```bash
nslookup -type=MX pmplan.net 8.8.8.8
nslookup -type=MX send.pmplan.net 8.8.8.8
```
