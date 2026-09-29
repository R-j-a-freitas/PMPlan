# Arquivo dos documentos assinados

Quando o cliente devolve a carta de manutenções assinada, o PDF é arquivado
automaticamente na ficha do hospital. Não há upload manual: o documento entra pela
resposta ao email.

## Como funciona

```
Carta de assinatura ─────► cliente
   Reply-To: documentos@pmplan.net (+ quem enviou)
   Assunto:  "... — Hosp. de Braga [PM-80DE6BE8]"
                                    └── código da proposta
                                        (BT-... na via de braquiterapia)

cliente carrega em "Responder" e anexa o PDF assinado
   │
   ▼
Resend (inbound, MX do domínio) ──webhook email.received──► Edge Function
                                                            inbound-signed-document
   │
   ├── vai buscar o email e os anexos à API da Resend
   ├── identifica o hospital (ver cascata abaixo)
   ├── guarda o PDF no bucket privado `signed-documents`
   └── cria a linha em `signed_documents`
   │
   ▼
Hospitais → botão "Documentos (N)" → Ver / Descarregar
```

O `Reply-To` é o que faz isto funcionar sozinho. Pedir ao cliente que ponha a caixa em CC
seria depender do passo mais frágil da cadeia: basta ele carregar em "Responder" e a
mensagem vem cá ter.

**A caixa de documentos vai só em Reply-To, nunca em CC.** Em CC, a nossa própria carta
era entregue à caixa (o inbound é catch-all) e o webhook arquivava o PDF *em branco* que
acabávamos de enviar, ao lado do assinado — com o mesmo nome de ficheiro, o que torna a
confusão fácil de não notar. Além de a ter tirado do CC, a função recusa qualquer email
cujo remetente seja do nosso próprio domínio (`isFromOurselves`), para o caso de uma cópia
reentrar por outra via: um bounce que devolve a mensagem original, um reencaminhamento
interno.

## Como o hospital é identificado

Cascata, da certeza ao palpite. O método usado fica gravado em `signed_documents.match_method`
e aparece como etiqueta na interface, porque a confiança não é a mesma:

| Método | Como | Fiabilidade |
|---|---|---|
| `reference_code` | Código `[PM-XXXXXXXX]` (ou `[BT-XXXXXXXX]`) no assunto → `client_proposals.reference_code` | Inequívoco |
| `subject_hospital` | Nome do hospital dentro do assunto (sem acentos, sem pontuação) | Alta |
| `sender_email` | Email do remetente coincide com um contacto do hospital | Palpite — confirmar |
| `unmatched` | Nada bateu certo | Fica na fila "por associar" |

### A proposta fecha sozinha (migração 0022)

Quando um documento fica associado a uma proposta, a proposta passa de "Carta enviada" a
"Assinado" sem ninguém carregar em "Marcar como assinado". Fazem-no dois triggers em
`signed_documents`, e não a Edge Function, porque há dois caminhos por onde um documento
ganha dono (o webhook e a associação manual na página de Hospitais):

- **Resolver a proposta, documento a documento** (0023). Um email pode trazer as duas
  cartas assinadas, por isso a via decide-se por cada PDF, por ordem de certeza:
  1. **código no nome do ficheiro** — o PDF que enviamos chama-se
     `Plano_Manutencao_[Braquiterapia_]<Hospital>_<ano>_<PM|BT-XXXXXXXX>.pdf`, e quem
     devolve o mesmo ficheiro assinado devolve o código;
  2. **via pelo nome do ficheiro** — "Braquiterapia"/Flexitron/Selectron → braquiterapia;
     `Plano_Manutencao_` sem esses indícios → geral. Corrige também o código do assunto
     quando o cliente responde a uma carta com os dois PDFs;
  3. **via pelo assunto**, se mencionar braquiterapia;
  4. sem indício nenhum: a única proposta do hospital em "Carta enviada", se só houver
     uma. Com duas e sem indício, fica no hospital e marca-se à mão.

  Com indício de via, nunca se cai para a outra: se a braquiterapia não está à espera de
  assinatura, um PDF "Braquiterapia" não fecha a carta geral.
- **Marcar como assinada.** `stage = 'signed'`, `signed_at` = data de chegada do
  documento, `signed_by` a null (é assim que a UI distingue a assinatura automática).

Um documento só fecha uma carta enviada **antes** de ele chegar: depois de "Reenviar carta
actualizada", uma assinatura antiga não vale pelo plano novo.

Na página de Aprovações o documento aparece no botão "Carta assinada" da linha e na tabela
"Cartas assinadas recebidas", que se actualiza em tempo real (a tabela está na publicação
`supabase_realtime`).

### Documentos por associar (0024)

Quando nada disto chega, o documento vai para **Aprovações → Documentos por associar**
(o separador mostra a contagem; a página de Hospitais mostra um aviso com o atalho). Entram
lá dois tipos:

- **Sem hospital** — nenhuma regra o reconheceu, ou o remetente é contacto de **mais de um
  hospital** (caixa partilhada de um grupo hospitalar). Neste último caso a função já não
  escolhe o primeiro que calha: guarda os candidatos em `candidate_hospital_ids`, e a
  página põe-nos à cabeça da lista de hospitais.
- **Via por definir** — o hospital é conhecido mas tem cartas à espera de assinatura e
  não se percebe de qual é o documento.

Em cada linha escolhe-se o hospital e, opcionalmente, a via (sem via, a BD deduz pelo nome
do ficheiro). Associar a uma carta em "Carta enviada" passa-a a "Assinado". Uma escolha
manual de hospital **e** via nunca é reinterpretada pelos triggers. O admin pode apagar o
que não for uma carta assinada.

A identificação pelo remetente usa `hospital_contacts` (0021), mais o jsonb antigo
`hospitals.contacts` enquanto existir. Contactos desactivados contam: desactivar tira dos
envios, não muda de quem é o contacto.

**Um documento nunca é descartado por não ser reconhecido.** Fica guardado com
`hospital_id` a null e aparece num aviso no topo da página de Hospitais, para associação
manual. Perder o PDF assinado de um cliente porque o assunto não bateu certo seria muito
pior do que ter uma fila para alguém arrumar.

O `In-Reply-To` **não** é usado: a Resend devolve no envio um id próprio (uuid), que não é
o `Message-ID` RFC que o cliente devolve nesse cabeçalho — os dois não são cruzáveis. O
assunto, esse, sobrevive ao "Re:" de qualquer cliente de email.

## Instalação

Três passos externos, que não estão no código.

### 1. Receção de email na Resend

Em <https://resend.com> → **Domains → pmplan.net → Inbound/Receiving** → activar.
A Resend mostra o registo MX a criar; adicioná-lo no DNS (Cloudflare):

| Tipo | Nome | Prioridade | Valor |
|---|---|---|---|
| MX | `@` (raiz, `pmplan.net`) | 10 | `inbound-smtp.eu-west-1.amazonaws.com` |

A região tem de bater certo com a do domínio na Resend (`eu-west-1`, Irlanda). **Usar
sempre o valor exacto que o painel mostra** em vez de copiar esta tabela — é ele que manda.

Porque é que na raiz é seguro, contra a recomendação genérica da Resend de usar um
subdomínio: essa recomendação existe para não roubar o correio a quem já recebe email no
domínio. O `pmplan.net` é dedicado ao PMPlan e **não tem caixas de correio nenhumas** — não
há nada para partir. O que existe é `send.pmplan.net` (MX de bounces da Resend) e o DKIM em
`resend._domainkey`, e nenhum dos dois é afectado por um MX na raiz.

Na Cloudflare há uma condição a mais: o **Email Routing tem de estar desligado**. Se
estiver, ela põe os MX dela na raiz e o inbound da Resend nunca chega lá.

Se algum dia o `pmplan.net` passar a ter caixas de correio a sério, a alternativa é mover
isto para um subdomínio (ex. `docs.pmplan.net`, com o endereço a passar a
`documentos@docs.pmplan.net`) e actualizar o `SIGNED_DOCUMENTS_MAILBOX`.


> **O inbound é catch-all.** Com o MX na raiz, a Resend entrega ao webhook *todos* os
> emails para qualquer endereço `@pmplan.net` — incluindo respostas ao `noreply@`,
> notificações e spam. Não é preciso criar a caixa `documentos@`: ela passa a existir por
> se ter activado a receção. Por isso a função filtra à entrada (ver
> `isForDocumentsMailbox`): só processa emails dirigidos à caixa de documentos, ou cujo
> assunto traga um código de proposta emitido por nós. Sem esse filtro, qualquer PDF que
> chegasse ao domínio ia parar ao arquivo.

O endereço em `SIGNED_DOCUMENTS_MAILBOX` de
[src/lib/proposalEmail.ts](../src/lib/proposalEmail.ts) (o que vai na carta) tem de constar
do secret `SIGNED_DOCUMENTS_MAILBOX` da Edge Function, que aceita uma **lista separada por
vírgulas**. Se não constar, as respostas deixam de ser arquivadas **sem nenhum erro
visível** — é a falha mais fácil de não dar por ela. A lista existe para as mudanças de
domínio: mantendo lá a caixa antiga, as respostas às cartas que já saíram continuam a
entrar.


### 2. Webhook

Resend → **Webhooks** → novo endpoint:

- URL: `https://<projecto>.supabase.co/functions/v1/inbound-signed-document`
- Evento: `email.received`
- Copiar o **signing secret** (`whsec_...`)

### 3. Deploy da função e secrets

```bash
supabase secrets set RESEND_WEBHOOK_SECRET=whsec_...
# Lista separada por vírgulas: a caixa actual mais as antigas que ainda recebem respostas
# a cartas enviadas antes de uma mudança de domínio.
supabase secrets set SIGNED_DOCUMENTS_MAILBOX=documentos@pmplan.net,documentos@stockmate.pt

supabase functions deploy inbound-signed-document --no-verify-jwt
supabase functions deploy send-proposal-email   # passou a aceitar replyTo
```

O `--no-verify-jwt` é obrigatório: quem chama é a Resend, que não tem um JWT do Supabase.
A autenticação é feita pela assinatura do webhook (formato Svix, verificada por HMAC na
função). Sem `RESEND_WEBHOOK_SECRET` definido a função recusa todos os pedidos — nunca
fica um endpoint público a aceitar payloads forjados.

## Verificar que está a funcionar

1. Enviar a carta de assinatura a um hospital de teste.
2. Confirmar que o assunto recebido tem o código `[PM-XXXXXXXX]` (ou `[BT-XXXXXXXX]`, se
   for a carta da via de braquiterapia).
3. Responder a esse email com um PDF qualquer em anexo.
4. Hospitais → o hospital → **Documentos** — deve lá estar, com a etiqueta verde "Código".

Se não aparecer: Resend → Webhooks → histórico de entregas (mostra o código de resposta da
função), e `supabase functions logs inbound-signed-document`.

## Notas de desenho

- **Só PDFs.** Sem o filtro, cada resposta traria também a assinatura gráfica do cliente,
  logótipos e o `.ics` devolvido.
- **Bucket privado.** São documentos contratuais; o frontend acede por *signed URL* válido
  5 minutos, nunca por URL pública.
- **Reentregas não duplicam.** `unique (inbound_email_id, filename)` + `upsert`: a Resend
  reenvia o webhook se a resposta demorar, e sem isto cada reentrega criava um documento
  novo.
- **Falha parcial devolve 200.** Se um anexo de três falhar, devolver erro faria a Resend
  reentregar tudo e reprocessar o que já está arquivado. Só devolve 500 quando nada passou
  — que é o caso em que vale mesmo a pena tentar de novo.
