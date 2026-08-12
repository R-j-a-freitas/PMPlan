# Vias de aprovação — Braquiterapia à parte

Os equipamentos de Braquiterapia seguem um processo de aprovação **independente** do resto
do hospital: validação dos engenheiros, aprovação do cliente, carta e recolha da assinatura
próprias. Nada nele espera pela via geral, e nada da via geral espera por ele.

---

## Porquê separado

Até à migração `0017` uma proposta era `unique (hospital_id, year)`: todas as PMs de um
hospital viajavam juntas — uma validação do engenheiro, uma aprovação do cliente, uma carta,
uma assinatura. Isso não serve para a braquiterapia: são equipamentos com engenheiros,
interlocutores e tempos próprios, e o cliente valida-os à parte. Um acelerador com data por
confirmar não pode segurar a carta da braquiterapia, nem a assinatura de uma valer pela
outra.

---

## Como funciona

Cada proposta tem uma **via** (`client_proposals.approval_track`), e a chave única passou a
ser `(hospital_id, year, approval_track)`. Um hospital com LINAC e Braquiterapia tem duas
propostas por ano:

| | Via **Geral** (`standard`) | Via **Braquiterapia** (`brachytherapy`) |
|---|---|---|
| Equipamento | tudo o que não é de uma via própria | modalidades marcadas como braquiterapia |
| Estado | próprio | próprio |
| Emails | `engineer_approval`, `client_proposal`, `signature_letter` | `brachy_engineer_approval`, `brachy_client_proposal`, `brachy_signature_letter` |
| Carta PDF | "Plano de Manutenções Preventivas {ano}" | "… **de Braquiterapia** {ano}" |
| Código no assunto | `[PM-XXXXXXXX]` | `[BT-XXXXXXXX]` |
| Ficheiros anexados | `Plano_Manutencao_<Hospital>_<ano>.pdf` | `Plano_Manutencao_Braquiterapia_<Hospital>_<ano>.pdf` |

A máquina de estados é exactamente a mesma (*Por enviar → Aguarda engenheiro → Aprovado
(engenheiro) → Aguarda cliente → Aprovado (cliente) → Carta enviada → Assinado*) — é a mesma
sequência corrida duas vezes em paralelo.

Na página **Aprovações**, cada linha é um par (hospital, via). O mesmo hospital pode
aparecer duas vezes, em fases diferentes, com a coluna **Via** a distingui-las. O filtro de
via no topo isola uma delas; a selecção e o botão "Avançar seleccionados" trabalham sobre as
linhas visíveis.

---

## Que equipamento entra na via da braquiterapia

A via é uma propriedade da **modalidade**, não uma lista de nomes no código:
`modalities.approval_track`. Edita-se em **Equipamentos → ✏️ Editar modalidades**, na coluna
ao lado do nome.

Porquê assim, e não `if modality = 'Braquiterapia'`: as modalidades são geridas na app desde
a `0008` (podem ser renomeadas) e `equipment.modality` é texto livre. Um nome hardcoded
partia-se no dia em que alguém escrevesse "Braquiterapia HDR".

Há na mesma uma rede de segurança em [`src/lib/approvalTrack.ts`](../src/lib/approvalTrack.ts):
equipamento cuja modalidade **não existe** na tabela (importada de um Excel, ou entretanto
removida) cai na via da braquiterapia se o nome contiver um dos indícios de
`BRACHYTHERAPY_HINTS`. Sem isso, uma modalidade escrita à mão ia dentro da carta dos
aceleradores, que é o que se quer evitar.

Os indícios não são só as palavras genéricas — são também os modelos dos afterloaders:

| Indício | Apanha |
|---|---|
| `braqui`, `brachy` | "Braquiterapia HDR", "Brachytherapy" |
| `flexitron` | `Flexitron`, `Flexitron+OB+Prostate` |
| `selectron` | `mSelectron`, microSelectron, Selectron |

Os modelos são precisos porque na prática **é assim que as modalidades se chamam**: as que
existem na base de dados são `Flexitron`, `Flexitron+OB+Prostate` e `mSelectron`, e nenhuma
tem "braqui" no nome. Uma lista só com as palavras genéricas marcava zero linhas — a via
nascia vazia e tudo continuava a ir na carta geral, sem nenhum sinal de que faltava alguma
coisa. Foi o que aconteceu quando a `0017` foi aplicada pela primeira vez, a 12/08/2026: as
três modalidades tiveram de ser marcadas à mão a seguir.

A mesma lista existe em dois sítios — `BRACHYTHERAPY_HINTS` no código e os `LIKE` do seed da
migração. **Ao acrescentar um modelo novo, acrescentar nos dois.**

---

## Código de referência e documentos assinados

O código no assunto da carta ganha prefixo por via: `PM-` na geral, `BT-` na braquiterapia
(trigger `set_proposal_reference_prefix`, migração `0017`). Os 8 hex continuam a vir de um
sítio só e são únicos entre as duas vias — o prefixo serve para se ver, no assunto de uma
resposta, **qual das duas cartas** o cliente assinou.

A Edge Function `inbound-signed-document` reconhece os dois prefixos e associa o documento à
**proposta** certa, não apenas ao hospital certo. Ver
[DOCUMENTOS_ASSINADOS.md](DOCUMENTOS_ASSINADOS.md).

---

## Efeito nas propostas que já existiam

Nenhuma perde estado nem histórico: ficam todas na via `standard` (o default da coluna). O
que muda é que deixam de arrastar consigo a braquiterapia do mesmo hospital — essa abre uma
proposta nova em *Por enviar*, e tem de percorrer o processo desde o início.

Mudar a via de uma modalidade **não** mexe em propostas já em curso; só se reflecte no que
ainda não foi enviado.

---

## Aplicar

1. `node scripts/apply-migration-0017.mjs` — aplica
   `supabase/migrations/0017_brachytherapy_approvals.sql` (colunas + trigger + 6 templates
   novos). É idempotente; correr duas vezes não faz mal.
   **Até este passo estar feito a página Aprovações não funciona**: o `insert` da proposta
   falha por a coluna `approval_track` não existir, e as modalidades vêm todas sem via
   (tudo cai na geral).
2. Redeploy da Edge Function, por causa do prefixo `BT-`:
   `supabase functions deploy inbound-signed-document --no-verify-jwt`
3. Confirmar em **Equipamentos → Editar modalidades** que as modalidades certas ficaram na
   via Braquiterapia — o seed acerta nos nomes conhecidos, mas um modelo com outro nome
   passa-lhe ao lado e não dá erro nenhum. Se a coluna **Via** estiver toda em "Geral",
   é sinal de que ficou por marcar.
4. Rever os textos em **Aprovações → Templates das aprovações → Via Braquiterapia** (os
   valores de origem são uma adaptação dos da via geral).
