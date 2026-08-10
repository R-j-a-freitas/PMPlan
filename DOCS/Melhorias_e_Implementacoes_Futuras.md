# Melhorias e Implementações Futuras — PMPlan

> Documento de roadmap. Reúne ideias de evolução que **ainda não estão implementadas**,
> com o racional de negócio, o esforço estimado e as peças do código/infra que já existem e
> podem ser reaproveitadas. Ordenado por valor para o utilizador.
>
> **Última atualização:** 2026-07-24

---

## Diagnóstico atual (ponto de partida)

A app é forte a **planear** (auto-scheduler, motor de conflitos, regras R7 hospital/dia e R8
cidade/dia, ancoragem de fins-de-semana) e a **obter aprovação** (workflow
engenheiro → cliente → carta de assinatura, templates de email, PDF, `.ics`). Tem PWA,
RBAC + RLS, importação/exportação Excel e destinatários de CC configuráveis.

**A lacuna central:** a app é excelente a *criar o plano*, mas quase não tem nada a **vigiar
se o plano está a ser cumprido** ou se **rebentou em silêncio**. É aí que estão as melhorias
mais fulcrais.

---

## 1. Camada de "cumprimento / risco" — deteção proativa + lembretes ⭐ (prioridade máxima)

**Problema.** O propósito de um planeador de PMs é *não falhar manutenções*. Hoje não há
resposta à pergunta que o utilizador faz todas as manhãs: **"o que estou prestes a falhar?"**
Não existe sequer o conceito de "em atraso" na aplicação.

**O que implementar:**
- **PMs em atraso** — data passou e o estado ≠ `completed`.
- **PMs por agendar** dentro da janela obrigatória ou a aproximar-se do limite.
- **Equipamento sem PM planeada** para o ano de planeamento.
- **Badge / painel de risco no Dashboard** com estes três indicadores.
- **Email-resumo semanal** (fase 2) a listar o que está em risco.

**Porquê é fulcral.** Transforma a app de "onde registo o plano" para "que me avisa antes de
haver problema" — que é o valor real da ferramenta.

**Reaproveita o que já existe:** `pm_events` (datas/estado), Dashboard, Resend + Edge
Function `send-proposal-email` (para o email), capacidade de cron/rotinas.

**Abordagem incremental:**
1. Badge "em atraso / em risco" no Dashboard — só uma query, sem infra nova.
2. Email semanal via cron → Resend.

**Esforço:** Médio (fase 1 baixo).

---

## 2. Rastreio de entrega dos emails ao cliente

**Problema.** Todo o workflow de aprovações depende de os emails chegarem. Se um email fizer
*bounce* (endereço inválido, caixa cheia), **ninguém sabe** e a proposta fica presa sem que
se perceba porquê.

**O que implementar:**
- **Webhook da Resend** → Edge Function que atualiza o estado em `email_log`
  (enviado / entregue / aberto / falhou / bounce).
- Indicador na página de **Aprovações** quando um envio falhou, com a razão.

**Porquê.** Fecha um buraco invisível: um envio que parece bem-sucedido mas nunca chegou.

**Reaproveita:** tabela `email_log` já existe; infra Resend + Edge Functions já montada.

**Esforço:** Médio.

---

## 3. Rede de fiabilidade — `ErrorBoundary` + testes no núcleo

**Problema.** Não existe **nenhum `ErrorBoundary`** (um erro num componente resulta em ecrã
branco para um utilizador não-técnico) e **não há um único teste** no projeto.

**O que implementar:**
- **`ErrorBoundary` global** com mensagem amigável e opção de recarregar/voltar.
- **Suite de testes** (ex.: Vitest) focada no núcleo mais frágil e crítico:
  - Gerador de `.ics` (`proposalIcs.ts`) — *line folding*, charset, `METHOD:PUBLISH`,
    datas exclusivas de fim.
  - Auto-scheduler (`autoScheduler.ts`) — regras R7/R8, fins-de-semana, ancoragem.
  - Motor de conflitos (`conflictRules.ts`).

**Porquê.** A saga do `.ics` (BOM, folding, charset) é exatamente o tipo de regressão que um
punhado de testes ao gerador apanharia antes de chegar ao cliente. Estas melhorias
**protegem o que já foi construído**.

**Nota:** o projeto ainda não tem *test runner* nas devDependencies — adicionar Vitest é o
primeiro passo.

**Esforço:** Baixo (ErrorBoundary) / Médio (testes).

---

## 4. Trilho de auditoria

**Problema.** Não há histórico de **quem** alterou/moveu/cancelou **que** PM ou proposta, e
**quando**. O `source_changes` só cobre alterações de fonte de equipamento — não é auditoria
geral.

**O que implementar:**
- Tabela `audit_log` (ator, ação, entidade, antes/depois, timestamp).
- Registo nas escritas sensíveis (mover/cancelar PM, mudar estado de proposta, envios).
- Vista de histórico consultável por PM / por proposta / por hospital.

**Porquê.** Domínio regulado (radioterapia) com cartas assinadas por clientes.
"O cliente diz que nunca propusemos X" resolve-se com histórico — accountability e resolução
de disputas.

**Esforço:** Médio.

---

## 5. Rede de segurança de dados — *soft-delete* / undo + backup

**Problema.** Apagar por engano numa BD de planeamento vivo é caro e hoje é irreversível.

**O que implementar:**
- **Soft-delete** (coluna `deleted_at`) nas entidades críticas, com opção de restaurar.
- **Undo** imediato após ações destrutivas (toast "Anular").
- **Export total de backup** (todas as tabelas para Excel/JSON) a pedido.

**Porquê.** Rede de segurança contra erro humano numa ferramenta usada no dia-a-dia.

**Reaproveita:** já existe `xlsx` no projeto para os exports.

**Esforço:** Médio.

---

## 6. Deteção e arquivo automático dos documentos assinados devolvidos pelo cliente

**Problema.** Depois de a carta de assinatura ser enviada, o cliente responde com o documento
assinado (normalmente um PDF digitalizado). Hoje esse documento fica na caixa de correio de
alguém e é preciso **marcar manualmente como assinado** — o artefacto legal do processo **não
fica guardado no sistema**, não há arquivo central nem prova rastreável.

**O que implementar:**
- **Arquivo do documento assinado no Supabase** — ficheiro no Supabase **Storage** (bucket
  próprio), **ligado à proposta** (`client_proposals`), com quem/quando.
- **Avanço automático do estado** da proposta para `signed`, com `signed_at` e registo em log
  (em vez do passo manual `confirm_signed`).
- **Deteção automática da resposta do cliente** (fase 2): processar o email de resposta,
  identificar o anexo PDF e correlacioná-lo com a proposta certa.

**Como correlacionar a resposta à proposta.** Embutir uma **referência única** no email da
carta (no assunto ou corpo) e/ou usar o `Message-ID`/`In-Reply-To` — a resposta traz essa
referência e o sistema sabe a que proposta pertence.

**Porquê é importante.** O documento assinado é a **prova legal** do acordo; deve ser
capturado, arquivado e rastreável automaticamente, não ficar perdido numa inbox. Fecha o
último elo do workflow de aprovações.

**Reaproveita o que já existe:** estados de `client_proposals` (já há a fase `signed` e a ação
manual `confirm_signed`), `email_log`, e a infra de Edge Functions.

**Decisão de infraestrutura a ter em conta.** *Email de saída* já está resolvido (Resend), mas
*email de entrada* precisa de um canal capaz de **receber** (ex.: webhook de inbound de um
fornecedor de email, uma rota de mailbox, ou *watch* de uma caixa Google Workspace) — é a
principal peça nova a decidir para a fase 2.

**Abordagem incremental:**
1. **Upload manual** do PDF assinado na página de Aprovações → guarda no Supabase Storage,
   liga à proposta e marca `signed`. Já entrega o arquivo central e a prova, sem infra de
   inbound.
2. **Deteção automática** da resposta do cliente com o anexo (requer canal de email de
   entrada).

**Esforço:** Baixo/Médio (fase 1: upload manual) / Alto (fase 2: deteção automática).

---

## Resumo priorizado

| # | Melhoria | Valor | Esforço | Cria valor novo vs. protege o existente |
|---|----------|-------|---------|------------------------------------------|
| 1 | Camada de risco / lembretes | ⭐⭐⭐ | Médio | **Cria valor novo** |
| 2 | Rastreio de entrega de emails | ⭐⭐ | Médio | Protege o workflow |
| 3 | ErrorBoundary + testes | ⭐⭐ | Baixo/Médio | Protege o existente |
| 4 | Trilho de auditoria | ⭐⭐ | Médio | Protege / conformidade |
| 5 | Soft-delete / undo / backup | ⭐ | Médio | Protege dados |
| 6 | Arquivo dos documentos assinados | ⭐⭐ | Baixo/Médio → Alto | **Cria valor novo** / conformidade |

**Recomendação:** começar pela **#1 (camada de risco/lembretes)** — é a única que *cria valor
novo* em vez de proteger o que já existe, e pode arrancar só com o badge no Dashboard, sem
infra nova.

---

## Ideias adicionais (backlog, por explorar)

- Pesquisa global (hospitais / equipamento / PMs) na Topbar.
- Melhorias de UX móvel (a app é PWA, mas as tabelas densas são difíceis no telemóvel).
- Robustez offline (a PWA já cacheia feriados; alargar a dados de negócio recentes só de
  leitura).
- Relatórios mais ricos (taxa de cumprimento por hospital/zona/engenheiro; tendências ano a
  ano).
- Confirmar/rever a dúvida em aberto sobre a duração do Versa HD (2 vs 3 dias) nas regras de
  agendamento.
