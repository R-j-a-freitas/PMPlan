# Sumário Executivo — PMPlan
## Sistema de Gestão de Manutenções Preventivas — Radioterapia e Braquiterapia

**Versão:** 2.0 — Junho 2026  
**Projecto:** PMPlan — Elekta Portugal / Espanha  
**Modelo de desenvolvimento:** Vibe-coding supervisionado com IA (Claude)

---

## Descrição do Projecto

O **PMPlan** é uma Progressive Web App (PWA) profissional para planeamento e gestão de Manutenções Preventivas (PM) de equipamentos médicos de Radioterapia, Braquiterapia e sistemas associados instalados em hospitais de Portugal e Espanha.

O utilizador principal é o gestor/planeador de serviço técnico da Elekta que precisa de planear visualmente um ano completo de PM para dezenas a centenas de equipamentos, com o mínimo de cliques possível, e comunicar as datas aprovadas aos clientes e engenheiros de forma profissional e rastreável.

**O calendário é o elemento central e dominante da aplicação.** Tudo o resto serve o calendário.

---

## Stack Técnico

| Componente | Tecnologia | Estado |
|---|---|---|
| Frontend | React 18 + TypeScript (strict) | ✅ Implementado |
| Build | Vite 5 | ✅ Implementado |
| Estilos | TailwindCSS 3 | ✅ Implementado |
| Estado global | Zustand 4 | ✅ Implementado |
| Calendário | FullCalendar Standard v6 (MIT) | ✅ Implementado |
| Base de dados | Supabase (PostgreSQL + Auth + RLS) | ✅ Implementado |
| Edge Functions | Supabase Deno Runtime | ✅ Implementado |
| Email | Resend API (via Edge Function) | ✅ Implementado (conta temporária) |
| Microsoft 365 | Microsoft Graph API + MSAL.js | ⚠️ Parcial (sem App Registration) |
| Exportação | SheetJS (Excel) + jsPDF (PDF) | ✅ Implementado |
| Feriados | Nager.Date API | ✅ Implementado |
| PWA | Vite PWA Plugin + Workbox | ✅ Implementado |
| Hosting | Hetzner VPS (planeado) / Supabase (dev) | ⏳ Planeado |
| Reverse proxy | Caddy 2 com HTTPS automático | ⏳ Planeado |

---

## Estado de Implementação por Funcionalidade

### Fase 1 — Infraestrutura, Autenticação e Calendário Base

| Funcionalidade | Estado | Notas |
|---|---|---|
| Setup Vite + React + TypeScript + TailwindCSS | ✅ Concluído | |
| Schema PostgreSQL completo com RLS | ✅ Concluído | Zonas, hospitais, engenheiros, equipamentos, PM events, source changes, holidays, conflitos, user_profiles |
| Autenticação Supabase (email/password) | ✅ Concluído | |
| Sistema de roles (admin/planner/engineer/readonly) | ✅ Concluído | Permissões granulares por role em toda a UI |
| Gestão de utilizadores (criar, gerir roles) | ✅ Concluído | Edge Function `admin-create-user` com validação JWT server-side |
| CRUD Hospitais / Clientes | ✅ Concluído | Inclui editor de contactos (nome, email, telefone, cargo) por hospital |
| CRUD Engenheiros (multi-zona) | ✅ Concluído | Selector de múltiplas zonas com zona principal |
| CRUD Equipamentos | ✅ Concluído | Zona derivada automaticamente do hospital (trigger PostgreSQL) |
| CRUD Zonas geográficas | ✅ Concluído | Hierarquia pai→filho, países PT/ES, cores parametrizáveis |
| Calendário FullCalendar v6 (vista anual + mensal + semanal) | ✅ Concluído | Apenas plugins MIT: multiMonth, dayGrid, timeGrid, list, interaction |
| Eventos PM no calendário com drag-and-drop | ✅ Concluído | hook `useDragDrop` com validação de conflitos antes de commit |
| Sistema de feriados PT e ES via Nager.Date | ✅ Concluído | Background events vermelho claro, cache em Zustand |
| Motor de conflitos (sobreposição engenheiro, feriados, carga de zona) | ✅ Concluído | `conflictRules.ts` — validação optimista no cliente + confirmação no servidor |
| Formatos de data e hora PT (DD/MM/AAAA, 24h) | ✅ Concluído | `DateInput` com máscara, `toDisplayDate()`, locale FullCalendar `pt-br` |
| PWA — instalável, service worker, precache | ✅ Concluído | Vite PWA Plugin + Workbox |

---

### Fase 2 — Planeamento Visual e Mapa de Cargas

| Funcionalidade | Estado | Notas |
|---|---|---|
| Filtros de visualização no calendário | ✅ Concluído | Sidebar colapsável com filtros independentes |
| Filtro por hierarquia de zonas (pai→filhos, cascade) | ✅ Concluído | `ZoneScopeFilter` com colapso/expansão, cascade ao toggle |
| Filtro por engenheiro (agrupado por zona) | ✅ Concluído | `EngineerFilter` com colapso por secção de zona |
| Filtro por equipamento (lista por hospital) | ✅ Concluído | `EquipmentList` com checkbox por linha |
| Semântica OR entre filtros (calendário vazio se nada selecionado) | ✅ Concluído | |
| Mapa de cargas anual — por zona | ✅ Concluído | Hierarquia de zonas, cálculo anual via `yearEvents` store |
| Mapa de cargas anual — por engenheiro | ✅ Concluído | Baseado em dias PM planeados vs. dias úteis no ano |
| Ícones de informação com métricas | ✅ Concluído | Tooltip com critério de cálculo por zona e por engenheiro |
| Colapso de secções de engenheiro/zona no mapa de cargas | ✅ Concluído | |
| Módulo de gestão de fontes de Braquiterapia | ✅ Concluído | `SourceChangeModal`, tabela `source_changes`, histórico por equipamento |
| Geração automática de PM (algoritmo histórico + distribuição base) | ⏳ Planeado | `useAutoScheduler.ts` / `autoScheduler.ts` — lógica especificada, não implementada |
| Agendamento com ancoragem histórica (ano anterior → proposta ano seguinte) | ⏳ Planeado | Modal de comparação lado a lado planeado mas não implementado |

---

### Fase 3 — Comunicação e Aprovação de Propostas a Clientes

| Funcionalidade | Estado | Notas |
|---|---|---|
| Página de Aprovações com workflow completo | ✅ Concluído | Draft → Aprovação Engenheiro → Aprovação Cliente → Carta Assinada |
| Envio de email de aprovação a engenheiros | ✅ Concluído | Via Resend (Edge Function), template editável PT/ES |
| Envio de proposta de calendário a clientes | ✅ Concluído | Tabela HTML bilingue (PT/ES), via Resend |
| Geração de carta PDF em PT e ES | ✅ Concluído | jsPDF, logótipo Elekta, variante PT/ES, tabela agrupada por equipamento |
| Convites de calendário .ics automáticos | ✅ Concluído | Enviados em anexo com a carta; download local disponível em qualquer fase |
| Email da carta de assinatura com PDF + .ics em anexo | ✅ Concluído | Resend suporta anexos reais (base64); `signature_letter` template |
| Templates de email bilingues (PT/ES) editáveis pelo admin | ✅ Concluído | 3 templates × 2 línguas = 6 linhas na tabela `email_templates` |
| Editor de templates na UI | ✅ Concluído | `TemplateEditor.tsx` — editor por (chave, país) |
| CC automático — admin + teresa.matos@elekta.com | ✅ Concluído | `TERESA_EMAIL` constante em `Approvals.tsx` |
| Selecção de língua do email por país do hospital | ✅ Concluído | `bundle.hospital.country` → selecciona template PT ou ES |
| Seleção múltipla e avanço em bloco de propostas | ✅ Concluído | "Avançar seleccionados" com checkbox por linha |
| Pré-visualização PDF no browser | ✅ Concluído | Botão "Pré-visualizar Carta" abre PDF em nova tab |
| Reenvio de emails por fase | ✅ Concluído | Botões "Reenviar" independentes por fase do workflow |
| Log de emails enviados | ✅ Concluído | Tabela `email_log` com timestamp, destinatários e tipo |
| Sincronização bidirecional com Outlook (criar eventos nos engenheiros) | ⚠️ Bloqueado | Código implementado (`graphClient.ts`, MSAL); bloqueado por falta de Azure App Registration — sem permissões no tenant Elekta para criar registo de aplicação |
| Notificações push / webhooks Outlook | ⏳ Planeado | Dependente da resolução do bloqueio Azure |

---

### Fase 4 — Relatórios, Produção e Go-Live

| Funcionalidade | Estado | Notas |
|---|---|---|
| Relatórios com filtros (hospital, engenheiro, ano) | ✅ Concluído | Página `Reports.tsx` com ordenação por coluna |
| Exportação Excel | ✅ Concluído | SheetJS — `exportPMEventsToExcel()` |
| Exportação PDF (tabela de relatório) | ✅ Concluído | jsPDF — `exportPMEventsToPdf()` |
| Permissões granulares por role em toda a UI | ✅ Concluído | `authStore` com `canCreatePM`, `canSendEmails`, etc. |
| Configurações — gestão de zonas | ✅ Concluído | `Settings.tsx` |
| Deploy em Hetzner VPS com Caddy | ⏳ Planeado | Infra especificada, não configurada |
| HTTPS automático via Let's Encrypt | ⏳ Planeado | Dependente do deploy VPS |
| Domínio próprio PMPlan | ⏳ Planeado | Email `noreply@pmplan.pt` (actualmente usa `noreply@stockmate.pt` temporariamente) |
| Conta Resend dedicada ao PMPlan | ⏳ Planeado | Actualmente usa conta emprestada de outro projecto |
| Auditoria de alterações (log de quem fez o quê e quando) | ⏳ Planeado | |
| App mobile nativa (React Native) | ⏳ Fora de âmbito (v2) | Fora do âmbito actual — PWA instalável cobre a maioria dos casos |

---

## Fases de Desenvolvimento — Estado Actual

| Fase | Meses | Objectivo principal | Estado |
|------|-------|---------------------|--------|
| **1** | 1–3 | Setup infra + auth + CRUD base + calendário + feriados + conflitos básicos | ✅ Concluída |
| **2** | 4–6 | Drag-and-drop + mapa de cargas + Braquiterapia + filtros avançados | ✅ Concluída (excepto geração automática) |
| **3** | 7–9 | Aprovação de propostas + emails automáticos + PDF + .ics | ✅ Concluída (excepto Outlook bidirecional) |
| **4** | 10–12 | Relatórios + permissões + PWA + geração automática + go-live | ⏳ Em curso (relatórios e PWA concluídos; deploy e geração automática pendentes) |

---

## Itens Pendentes e Bloqueios Conhecidos

### Bloqueio Azure App Registration
A sincronização bidirecional com o calendário Outlook dos engenheiros (criar e actualizar eventos PM directamente no Outlook) requer um **Azure App Registration** no tenant Microsoft da Elekta com o scope `Calendars.ReadWrite`. O código MSAL está implementado em `src/lib/graphClient.ts`, mas o registo de aplicação não pode ser criado sem permissões de administrador no tenant.

**Alternativa implementada:** Geração e envio automático de ficheiros `.ics` (iCalendar) em anexo ao email da carta de aprovação. Qualquer cliente de email (Outlook, Google, Apple) importa estes ficheiros com um duplo-clique, sem necessidade de API.

**Próximo passo:** Abrir pedido ao IT da Elekta para criação de App Registration com scope `Calendars.ReadWrite`.

### Email — Conta e Domínio Temporários
O envio de email usa temporariamente a conta Resend do projecto `stockmate.pt` com `FROM: noreply@stockmate.pt`. Este endereço deve ser substituído por `noreply@pmplan.pt` (ou domínio definitivo) assim que:
1. Domínio dedicado ao PMPlan for adquirido e configurado.
2. Conta Resend própria do PMPlan for criada.
3. Secrets Supabase actualizados: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`.

### Limpeza de Segurança antes do GitHub
Antes de publicar o código no GitHub, remover:
- `service_role` key e ficheiro `.env.service-role` (gitignored, apenas dev local)
- Função `exec_sql` RPC na base de dados (apenas para migrações locais de desenvolvimento)
- Ficheiro `.env.resend` (gitignored — contém a chave Resend temporária)

### Geração Automática de PM (Pendente)
O algoritmo de geração automática (`autoScheduler.ts`) está especificado em detalhe no documento de prompt técnico (`PROMPT_PM_Radioterapia.md`, secção 7) mas não foi implementado. Esta é a funcionalidade de maior valor para o planeador: gerar uma proposta de plano anual baseada no histórico do ano anterior com ancoragem nas datas reais de execução.

---

## Arquitectura de Armazenamento e Segurança

- **Row Level Security (RLS)** activa em todas as tabelas.
- **Edge Functions** validam o JWT do chamador e verificam o role em `user_profiles` server-side — nunca confiam apenas no frontend.
- **Chaves secretas** (Resend, service_role) guardadas exclusivamente como Supabase Secrets, nunca no bundle do frontend.
- **Dados de negócio** apenas em Supabase PostgreSQL — nunca em `localStorage`.

---

## Capacidade e Performance

- Suporte testado para **500+ equipamentos** e **5.000+ eventos/ano**.
- Virtualização de eventos FullCalendar nativa — sem degradação em vistas densas.
- Zustand stores com selectors granulares — sem re-renders desnecessários.
- Service Worker Workbox para cache offline de dados recentes.
- Índices PostgreSQL explícitos em todas as colunas de filtragem e ordenação frequentes.

---

## Modelo de Desenvolvimento

O projecto usa um modelo de **vibe-coding supervisionado com IA** (Claude): o responsável de projecto define os requisitos de negócio e valida os resultados; a implementação técnica é assistida por IA com supervisão activa em cada decisão arquitectural. Todas as decisões de stack, schema e segurança são revistas pelo responsável antes de aplicadas.

---

*Sumário Executivo PMPlan v2.0 — Junho 2026*  
*Documento vivo — actualizar sempre que uma fase ou funcionalidade mudar de estado.*
