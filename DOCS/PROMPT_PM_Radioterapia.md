# PROMPT — Sistema de Gestão de Manutenções Preventivas (PM) de Radioterapia e Braquiterapia
## Instrução de uso
Usa esta prompt como ponto de partida de cada sessão de desenvolvimento. Cola-a integralmente antes de qualquer pedido de código. Ela define a arquitectura, as decisões técnicas já tomadas e as regras que não podem ser violadas.

---

## 1. CONTEXTO DO PROJECTO

Estás a desenvolver uma **Progressive Web App (PWA) profissional** para planeamento e gestão de Manutenções Preventivas (PM) de equipamentos médicos de Radioterapia, Braquiterapia e sistemas associados.

O utilizador principal é um gestor/planeador de serviço técnico hospitalar que precisa de planear visualmente um ano completo de PM para dezenas a centenas de equipamentos, com o mínimo de cliques possível.

**O calendário é o elemento central e dominante da aplicação.** Tudo o resto serve o calendário.

---

## 2. STACK TÉCNICO — DECISÕES FINAIS (NÃO ALTERAR)

```
Frontend:        React 18 + TypeScript (strict mode)
Build:           Vite 5
Estilos:         TailwindCSS 3
Estado global:   Zustand 4
Calendário:      FullCalendar Standard v6 (MIT, gratuito — NÃO usar plugins Premium)
Backend:         Supabase (free tier — PostgreSQL + Auth + Realtime + Storage)
Hosting:         Hetzner VPS CX32 (4 vCPU, 8GB RAM, 80GB NVMe)
Reverse proxy:   Caddy 2 (HTTPS automático via Let's Encrypt)
Feriados:        Nager.Date API (gratuita — cobre Portugal e Espanha)
Email:           Resend (free tier)
Microsoft 365:   Microsoft Graph API + MSAL.js
Exportação:      SheetJS (Excel) + jsPDF (PDF)
PWA:             Vite PWA Plugin + Workbox
```

### Restrições de licença FullCalendar (CRÍTICO)
- Usar **apenas plugins Standard (MIT)**: `daygrid`, `timegrid`, `list`, `multimonth`, `interaction`
- **NÃO usar** `@fullcalendar/resource-timeline` (Premium — timeline horizontal)
- **NÃO usar** `@fullcalendar/resource-daygrid` nem `@fullcalendar/resource-timegrid` (Premium — Vertical Resource View)
- A vista de recursos por engenheiro é implementada com **filtro React + Zustand**, não com plugins Premium

---

## 3. ARQUITECTURA DE FICHEIROS

```
src/
├── app/
│   ├── App.tsx
│   ├── Router.tsx
│   └── Providers.tsx
├── components/
│   ├── calendar/
│   │   ├── MainCalendar.tsx          # Componente raiz do calendário
│   │   ├── CalendarToolbar.tsx       # Barra de controlos e vistas
│   │   ├── EventContent.tsx          # Render customizado de eventos PM
│   │   ├── HolidayLayer.tsx          # Background events de feriados
│   │   └── ConflictIndicator.tsx     # Overlay de conflitos
│   ├── sidebar/
│   │   ├── Sidebar.tsx               # Container recolhível/redimensionável
│   │   ├── EquipmentList.tsx         # Lista drag-source de equipamentos
│   │   ├── EngineerFilter.tsx        # Filtro por engenheiro
│   │   └── LoadMap.tsx               # Mapa de carga verde/amarelo/vermelho
│   ├── modals/
│   │   ├── PMEventModal.tsx          # Criar/editar evento PM
│   │   ├── SourceChangeModal.tsx     # Troca de fonte braquiterapia
│   │   └── ConflictModal.tsx         # Mostrar conflito + sugestão alternativa
│   └── ui/                           # Componentes genéricos (Button, Badge, etc.)
├── stores/
│   ├── calendarStore.ts              # Eventos, vistas, estado do calendário
│   ├── equipmentStore.ts             # Equipamentos, cores, filtros activos
│   ├── engineerStore.ts              # Engenheiros, disponibilidade, carga
│   ├── zoneStore.ts                  # Zonas paramétricas + hospitais por zona
│   ├── holidayStore.ts               # Feriados por zona e ano
│   └── conflictStore.ts             # Regras de conflito e log
├── hooks/
│   ├── useConflictEngine.ts          # Motor de validação de conflitos
│   ├── useHolidays.ts                # Fetch e cache de feriados Nager.Date
│   ├── useAutoScheduler.ts           # Geração automática de PM anuais
│   ├── useOutlookSync.ts             # Sincronização Microsoft Outlook
│   └── useDragDrop.ts                # Lógica drag-and-drop + validação
├── lib/
│   ├── supabase.ts                   # Cliente Supabase tipado
│   ├── graphClient.ts                # Cliente Microsoft Graph API
│   ├── conflictRules.ts              # Regras puras de conflito (sem side-effects)
│   ├── autoScheduler.ts              # Algoritmo de distribuição de PM
│   └── exporters/
│       ├── excelExporter.ts          # SheetJS
│       └── pdfExporter.ts            # jsPDF
├── types/
│   ├── equipment.ts
│   ├── engineer.ts
│   ├── zone.ts
│   ├── pmEvent.ts
│   ├── sourceChange.ts
│   ├── holiday.ts
│   └── conflict.ts
└── pages/
    ├── Dashboard.tsx                 # Página principal — calendário
    ├── Equipment.tsx                 # CRUD equipamentos
    ├── Engineers.tsx                 # CRUD engenheiros (com selector multi-zona)
    ├── Clients.tsx                   # CRUD clientes/hospitais (com zona obrigatória)
    ├── Reports.tsx                   # Relatórios e exportação
    └── Settings.tsx                  # Configurações, permissões e gestão de Zonas
```

---

## 4. SCHEMA DA BASE DE DADOS (PostgreSQL / Supabase)

### Princípios de modelação de zonas (CRÍTICO — ler antes de tocar no schema)
- **Zonas são paramétricas** — criadas e geridas pelo administrador na UI, nunca hardcoded
- **A zona de um equipamento é sempre derivada do seu hospital** — nunca editada directamente
- Quando um hospital muda de zona, um trigger propaga a alteração a todos os seus equipamentos
- O campo `zone_id` em `equipment` é desnormalizado intencionalmente para performance de queries do calendário (5000+ eventos)
- Um engenheiro pode cobrir múltiplas zonas — relação many-to-many via `engineer_zones`

```sql
-- ─── ZONAS GEOGRÁFICAS PARAMETRIZÁVEIS ───────────────────────────────────────
-- Criadas pelo administrador — ex: "Norte PT", "Madrid", "Galiza ES"
create table zones (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,    -- ex: "PT-N", "ES-MAD", "PT-C"
  country     text not null check (country in ('PT', 'ES')),
  description text,
  color       text default '#6B7280',  -- cor da zona no mapa de carga sidebar
  active      boolean default true,
  created_at  timestamptz default now()
);

-- ─── HOSPITAIS / CLIENTES ────────────────────────────────────────────────────
-- Cada hospital pertence a uma zona — esta é a relação de origem de toda a hierarquia
create table hospitals (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  short_name text,                      -- label curto para o calendário ex: "IPO Porto"
  address    text,
  zone_id    uuid not null references zones(id),   -- OBRIGATÓRIO
  contacts   jsonb default '[]',        -- [{name, email, phone, role}]
  active     boolean default true,
  created_at timestamptz default now()
);

-- ─── ENGENHEIROS ─────────────────────────────────────────────────────────────
create table engineers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  email               text unique not null,
  phone               text,
  primary_zone_id     uuid references zones(id),   -- zona principal de actuação
  skills              text[] default '{}',
  outlook_calendar_id text,             -- ID do calendário Outlook para sincronização
  active              boolean default true,
  created_at          timestamptz default now()
);

-- Engenheiro ↔ Zonas (many-to-many)
-- Um engenheiro pode cobrir múltiplas zonas; primary_zone_id mantém-se para filtros rápidos
create table engineer_zones (
  engineer_id uuid not null references engineers(id) on delete cascade,
  zone_id     uuid not null references zones(id)     on delete cascade,
  is_primary  boolean default false,
  primary key (engineer_id, zone_id)
);

-- ─── EQUIPAMENTOS ────────────────────────────────────────────────────────────
-- zone_id é desnormalizado (copiado de hospitals.zone_id) para performance
-- NÃO editar zone_id directamente na UI — é gerido pelo trigger abaixo
create table equipment (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  manufacturer          text,
  model                 text,
  modality              text not null,   -- 'LINAC','Braquiterapia','TPS','Dosimetria',etc.
  serial_number         text,
  hospital_id           uuid not null references hospitals(id),
  zone_id               uuid not null references zones(id),
  -- zone_id é sempre igual a hospitals.zone_id — actualizado pelo trigger abaixo
  engineer_primary_id   uuid references engineers(id),
  engineer_secondary_id uuid references engineers(id),
  pm_per_year           int not null check (pm_per_year in (1,2,3,4)),
  pm_duration_days      int not null default 1,
  needs_shutdown        boolean default false,
  color                 text not null default '#3B82F6',  -- hex, escolhida pelo utilizador
  active                boolean default true,
  created_at            timestamptz default now()
);

-- Trigger: quando um hospital muda de zona, propaga para todos os seus equipamentos
create or replace function sync_equipment_zone()
returns trigger language plpgsql as $$
begin
  if OLD.zone_id is distinct from NEW.zone_id then
    update equipment
       set zone_id = NEW.zone_id
     where hospital_id = NEW.id;
  end if;
  return NEW;
end;
$$;

create trigger trg_hospital_zone_change
  after update on hospitals
  for each row execute function sync_equipment_zone();

-- ─── EVENTOS PM ──────────────────────────────────────────────────────────────
create table pm_events (
  id               uuid primary key default gen_random_uuid(),
  equipment_id     uuid not null references equipment(id) on delete cascade,
  engineer_id      uuid not null references engineers(id),
  start_date       date not null,         -- data planeada de início
  end_date         date not null,         -- data planeada de fim
  actual_start_date date,                 -- data real de início (engenheiro preenche)
  actual_end_date   date,                 -- data real de fim
  completed_at      timestamptz,          -- timestamp de conclusão
  -- O motor de ancoragem histórica usa: actual_start_date ?? start_date
  status           text not null default 'planned'
    check (status in ('planned','confirmed','in_progress','completed','cancelled','delayed')),
  outlook_event_id text,            -- ID do evento criado no Outlook
  notes            text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ─── TROCAS DE FONTE (BRAQUITERAPIA) ─────────────────────────────────────────
create table source_changes (
  id                   uuid primary key default gen_random_uuid(),
  equipment_id         uuid not null references equipment(id) on delete cascade,
  source_type          text not null,
  initial_activity_gbq numeric,
  planned_date         date not null,
  actual_date          date,
  serial_number        text,
  manufacturer         text,
  notes                text,
  status               text default 'planned'
    check (status in ('planned','completed','cancelled')),
  created_at           timestamptz default now()
);

-- ─── FERIADOS (via Nager.Date API) ───────────────────────────────────────────
-- zone_id null = feriado nacional (aplica a todos os hospitais do país)
-- zone_id preenchido = feriado regional/local (aplica só à zona)
create table holidays (
  id       uuid primary key default gen_random_uuid(),
  zone_id  uuid references zones(id),   -- null para feriados nacionais
  country  text not null check (country in ('PT', 'ES')),
  date     date not null,
  name     text not null,
  type     text not null check (type in ('national','regional','local')),
  year     int not null,
  source   text default 'nager-date',
  unique(country, zone_id, date, name)
);

-- ─── LOG DE CONFLITOS ────────────────────────────────────────────────────────
create table conflict_log (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid references pm_events(id) on delete cascade,
  conflict_type text not null
    check (conflict_type in
      ('engineer_overlap','holiday_block','zone_overload','engineer_unavailable')),
  description   text,
  resolved      boolean default false,
  created_at    timestamptz default now()
);

-- ─── UTILIZADORES (extends Supabase Auth) ────────────────────────────────────
create table user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text,
  role         text not null default 'readonly'
    check (role in ('admin','planner','engineer','readonly')),
  engineer_id  uuid references engineers(id),
  microsoft_id text,             -- Azure AD Object ID para SSO
  created_at   timestamptz default now()
);

-- ─── RLS (activar em todas as tabelas) ───────────────────────────────────────
alter table zones           enable row level security;
alter table hospitals       enable row level security;
alter table engineers       enable row level security;
alter table engineer_zones  enable row level security;
alter table equipment       enable row level security;
alter table pm_events       enable row level security;
alter table source_changes  enable row level security;
alter table holidays        enable row level security;
alter table conflict_log    enable row level security;
alter table user_profiles   enable row level security;

-- ─── VIEWS PARA QUERIES DO CALENDÁRIO ────────────────────────────────────────
-- Evitam joins repetidos nos componentes — usar sempre estas views no frontend

create view hospitals_with_zone as
select
  h.*,
  z.name    as zone_name,
  z.code    as zone_code,
  z.country as zone_country,
  z.color   as zone_color
from hospitals h
join zones z on z.id = h.zone_id;

create view equipment_full as
select
  e.*,
  h.name       as hospital_name,
  h.short_name as hospital_short_name,
  z.name       as zone_name,
  z.code       as zone_code,
  z.color      as zone_color
from equipment e
join hospitals h on h.id = e.hospital_id
join zones     z on z.id = e.zone_id;

-- ─── ÍNDICES CRÍTICOS PARA PERFORMANCE ───────────────────────────────────────
create index idx_pm_events_dates      on pm_events(start_date, end_date);
create index idx_pm_events_engineer   on pm_events(engineer_id);
create index idx_pm_events_equipment  on pm_events(equipment_id);
create index idx_holidays_zone_year   on holidays(zone_id, year, country);
create index idx_holidays_country_year on holidays(country, year);
create index idx_equipment_zone       on equipment(zone_id);
create index idx_equipment_hospital   on equipment(hospital_id);
create index idx_hospitals_zone       on hospitals(zone_id);
create index idx_engineer_zones       on engineer_zones(engineer_id, zone_id);
```

### Regras de negócio derivadas do schema de zonas (implementar no frontend)

1. **Formulário de equipamento:** `zone_id` é campo readonly, preenchido automaticamente ao seleccionar o hospital. O utilizador nunca edita a zona do equipamento directamente.

2. **Formulário de engenheiro:** selector multi-zona com checkbox. Uma zona marcada como principal (`is_primary = true`). A `primary_zone_id` em `engineers` é actualizada no mesmo transaction da `engineer_zones`.

3. **Filtro de feriados no motor de conflitos:** um feriado aplica-se a uma PM se:
   ```typescript
   holiday.zone_id === equipment.zone_id        // feriado regional da mesma zona
   || (holiday.zone_id === null                  // feriado nacional
       && holiday.country === zone.country)      // do mesmo país
   ```

4. **Gestão de zonas (página Settings → Zonas):** CRUD completo de zonas pelo admin. Ao eliminar uma zona, o sistema deve verificar se existem hospitais associados e bloquear a eliminação com mensagem explicativa.

---

## 5. REGRAS DE CONFLITO (motor de validação)

As regras são verificadas em **tempo real** no cliente (optimistic UI) e novamente no servidor antes de commit. Um conflito nunca é silencioso — bloqueia ou alerta visualmente de imediato.

```typescript
// src/lib/conflictRules.ts

export type ConflictType =
  | 'engineer_overlap'      // Engenheiro com dois eventos em simultâneo
  | 'holiday_block'         // PM colocada em feriado
  | 'zone_overload'         // Zona com mais PM do que capacidade disponível
  | 'engineer_unavailable'; // Engenheiro indisponível no Outlook

export interface ConflictResult {
  hasConflict: boolean;
  type?: ConflictType;
  message?: string;
  suggestedDate?: Date;     // Próxima data disponível sugerida automaticamente
}

// Regra 1: Engenheiro não pode ter dois eventos sobrepostos
export function checkEngineerOverlap(
  engineerId: string,
  startDate: Date,
  endDate: Date,
  existingEvents: PMEvent[],
  excludeEventId?: string
): ConflictResult

// Regra 2: Nenhuma PM em feriado
// Aplica feriados nacionais (zone_id null, mesmo country) + regionais (mesmo zone_id)
export function checkHolidayConflict(
  date: Date,
  zoneId: string,
  zoneCountry: 'PT' | 'ES',
  holidays: Holiday[]
): ConflictResult

// Regra 3: Carga de zona (alerta, não bloqueio)
export function checkZoneLoad(
  zoneId: string,
  month: number,
  year: number,
  events: PMEvent[],
  engineers: Engineer[]
): ConflictResult

// Função principal que agrega todas as regras
export function validatePMPlacement(params: {
  engineerId: string;
  zoneId: string;
  zoneCountry: 'PT' | 'ES';
  startDate: Date;
  endDate: Date;
  existingEvents: PMEvent[];
  holidays: Holiday[];
  excludeEventId?: string;
}): ConflictResult[]
```

### Comportamento de drag-and-drop com conflito
- Se o drop cair num feriado → **bloqueio imediato**, evento volta à posição original, toast vermelho com nome do feriado
- Se o drop criar sobreposição de engenheiro → **bloqueio imediato**, modal `ConflictModal` com sugestão de data alternativa
- Se o drop criar carga elevada de zona → **aviso amarelo**, mas permite o drop (não bloqueia)

---

## 6. VISTAS DO CALENDÁRIO (FullCalendar Standard apenas)

```typescript
// Configuração das vistas disponíveis — NÃO usar plugins Premium
const calendarViews = {
  // Vista anual — elemento principal de planeamento estratégico
  multiMonthYear: {
    type: 'multiMonth',
    duration: { years: 1 },
    multiMonthMaxColumns: 3,     // 3 colunas × 4 linhas = 12 meses
    fixedWeekCount: false,
  },
  // Vista trimestral
  multiMonthQuarter: {
    type: 'multiMonth',
    duration: { months: 3 },
    multiMonthMaxColumns: 3,
  },
  // Vista mensal standard
  dayGridMonth: {
    type: 'dayGrid',
    duration: { months: 1 },
  },
  // Vista semanal com horas
  timeGridWeek: {
    type: 'timeGrid',
    duration: { weeks: 1 },
  },
};

// NOTA: Sem Timeline View (Premium). Sem Vertical Resource View (Premium).
// Agrupamento por engenheiro é feito via filtro Zustand, não via recursos FullCalendar.
```

### Vista de recursos por engenheiro (solução sem Premium)
A sidebar esquerda mostra uma lista de engenheiros com indicadores de carga. Clicar num engenheiro filtra o calendário para mostrar apenas os seus eventos. O mapa de carga (verde/amarelo/vermelho) é calculado no Zustand store e renderizado na sidebar, não no calendário.

---

## 7. GERAÇÃO AUTOMÁTICA DE PM

```typescript
// src/lib/autoScheduler.ts

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface HistoricalPM {
  plannedDate: Date;
  actualDate: Date | null;   // null se PM não foi executada / não registada
  status: PMStatus;
}

interface SchedulerConfig {
  equipmentId: string;
  pmPerYear: 1 | 2 | 3 | 4;
  targetYear: number;
  preferredEngineerId: string;
  holidays: Holiday[];
  existingEventsTargetYear: PMEvent[];  // eventos já existentes no ano alvo
  zoneId: string;
  zoneCountry: 'PT' | 'ES';
  // Histórico do ano anterior — usado para ancoragem de intervalos
  previousYearHistory: HistoricalPM[];  // vazio = sem histórico → usar distribuição base
}

interface ProposedPMEvent {
  equipmentId: string;
  engineerId: string;
  proposedStartDate: Date;
  proposedEndDate: Date;
  anchorSource: 'historical' | 'base_distribution'; // de onde veio a data âncora
  previousActualDate: Date | null;  // data real do ano anterior (para mostrar na UI)
  intervalDays: number;             // intervalo calculado em dias (para auditoria)
  conflicts: ConflictResult[];      // conflitos detectados (resolvidos automaticamente)
  adjustmentReason?: string;        // razão de ajuste se a data foi movida
}

// ─── FUNÇÃO DE ANCORAGEM HISTÓRICA ───────────────────────────────────────────

// Determina a data âncora de referência para cada PM do ano anterior.
// Prioridade: data_realizada > data_planeada > null (sem histórico)
function resolveAnchorDate(historical: HistoricalPM): Date {
  return historical.actualDate ?? historical.plannedDate;
}

// ─── ALGORITMO PRINCIPAL ─────────────────────────────────────────────────────

// Modo 1 — SEM histórico do ano anterior (primeiro ano ou dados em falta):
//   Usa distribuição base por frequência:
//   1 PM/ano  → Junho
//   2 PM/ano  → Janeiro + Julho
//   3 PM/ano  → Janeiro + Maio + Setembro
//   4 PM/ano  → Janeiro + Abril + Julho + Outubro

// Modo 2 — COM histórico do ano anterior (caso normal):
//   1. Para cada PM do ano anterior, calcular a data âncora (realizada ?? planeada)
//   2. Calcular o intervalo ideal: 365 / pmPerYear dias
//   3. Propor nova data = anchorDate + intervaloDias
//   4. Se a data proposta cair fora do ano alvo → ajustar para dentro do ano
//      mantendo a proporção relativa (não forçar para Janeiro)
//   5. Aplicar todas as regras de bloqueio (feriados, fim-de-semana, sobreposição)

// ─── REGRAS DE AJUSTE (aplicadas em cascata, por ordem) ─────────────────────
//
// R1. Data proposta em feriado → avançar para próximo dia útil
// R2. Data proposta em fim-de-semana → avançar para segunda-feira
// R3. Data proposta com sobreposição de engenheiro → avançar 7 dias e re-validar
// R4. Após 3 tentativas sem encontrar data livre → alargar para ±14 dias e avisar
// R5. Nunca reduzir o número total de PMs — se não encontrar data, incluir
//     na proposta com flag `requiresManualReview: true`
// R6. O intervalo efectivo nunca pode ser inferior a 60 dias entre PMs do mesmo
//     equipamento (protecção contra compressão excessiva de histórico atrasado)
// R7. Resultado é sempre uma PROPOSTA — utilizador confirma antes de gravar

export function generateAnnualSchedule(config: SchedulerConfig): ProposedPMEvent[]

// ─── FUNÇÃO DE COMPARAÇÃO (para mostrar na UI) ────────────────────────────────

// Gera um diff visual entre o plano do ano anterior e o novo plano proposto
// Usado no modal de confirmação antes de o utilizador aprovar
export interface ScheduleComparison {
  equipmentId: string;
  previousYear: { date: Date; actual: Date | null }[];
  proposedYear: { date: Date; anchorSource: string; intervalDays: number }[];
  averageIntervalDays: number;       // intervalo médio do ano anterior
  proposedAverageIntervalDays: number; // intervalo médio proposto
  coherenceScore: number;            // 0–100: quão próximo do intervalo ideal
}

export function compareSchedules(
  previousHistory: HistoricalPM[],
  proposed: ProposedPMEvent[]
): ScheduleComparison
```

### Schema SQL — campo adicional necessário em `pm_events`

```sql
-- Adicionar à tabela pm_events:
alter table pm_events
  add column actual_start_date date,      -- data real de início (preenchida pelo engenheiro)
  add column actual_end_date   date,      -- data real de fim
  add column completed_at      timestamptz; -- timestamp de conclusão

-- Esta distinção entre (start_date/end_date) e (actual_start_date/actual_end_date)
-- é o que permite ao algoritmo de ancoragem histórica saber o que foi planeado
-- vs o que foi realmente executado.
-- O motor usa: actual_start_date ?? start_date como âncora do ano seguinte.
```

### Comportamento na UI — fluxo de agendamento com histórico

```
1. Utilizador abre "Gerar Plano 2026" para um equipamento
2. Sistema detecta automaticamente se existem PMs de 2025 com status 'completed'
3. Se existem → modo histórico: mostra modal com comparação lado a lado
   ┌─────────────────┬────────────────────────────────┐
   │ 2025 (realizado)│ 2026 (proposta)                │
   ├─────────────────┼────────────────────────────────┤
   │ Plan: 15 Jan    │ Prop: 16 Jan (+366 dias) ✓     │
   │ Real: 20 Jan    │ [âncora: data realizada]        │
   ├─────────────────┼────────────────────────────────┤
   │ Plan: 14 Abr    │ Prop: 21 Abr (+91 dias) ✓      │
   │ Real: 14 Abr    │                                 │
   ├─────────────────┼────────────────────────────────┤
   │ Plan: 14 Jul    │ Prop: 15 Jul (+92 dias) ✓      │
   │ Real: 28 Jul    │ [âncora: data realizada]        │
   ├─────────────────┼────────────────────────────────┤
   │ Plan: 13 Out    │ Prop: 28 Out (+92 dias) ⚠      │
   │ Real: (atraso)  │ [ajustado: feriado 27 Out]      │
   └─────────────────┴────────────────────────────────┘
   Coerência de intervalo: 94/100
4. Se não existem → modo base: distribuição por frequência padrão
5. Utilizador pode ajustar manualmente qualquer data antes de confirmar
6. Ao confirmar → gravar como pm_events com status 'planned'
```

---

## 8. INTEGRAÇÃO MICROSOFT 365

```typescript
// src/lib/graphClient.ts

// Autenticação: MSAL.js com Azure AD / Entra ID
// Scopes necessários: Calendars.ReadWrite, User.Read, offline_access

// Fluxo de sincronização:
// 1. PM aprovada no sistema → criar evento no Outlook do engenheiro
// 2. Evento Outlook alterado → webhook notifica o sistema → actualizar PM
// 3. Indisponibilidade no Outlook → conflictRules.checkEngineerUnavailable()

// Campos do evento Outlook criado:
const outlookEvent = {
  subject: `PM — ${equipment.name} (${equipment.model})`,
  body: { contentType: 'HTML', content: generatePMEmailBody(pm) },
  start: { dateTime: pm.start_date, timeZone: 'Europe/Lisbon' },
  end: { dateTime: pm.end_date, timeZone: 'Europe/Lisbon' },
  location: { displayName: hospital.name },
  // Deep link de volta à aplicação:
  webLink: `${APP_URL}/pm/${pm.id}`,
};
```

---

## 9. SISTEMA DE FERIADOS

```typescript
// src/hooks/useHolidays.ts

// API: https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}
// Países suportados: PT (Portugal), ES (Espanha)

// Fluxo:
// 1. No arranque da app, verificar se feriados do ano corrente existem na BD
// 2. Se não existirem → fetch Nager.Date → guardar na tabela holidays
// 3. Cache local em Zustand (holidayStore) para acesso síncrono nas validações
// 4. Feriados são renderizados como Background Events no FullCalendar (cor cinzenta)
// 5. Os feriados são sempre visíveis independentemente de filtros activos

// FullCalendar Background Event para feriados:
const holidayEvent = {
  start: holiday.date,
  end: holiday.date,
  display: 'background',
  backgroundColor: '#FEE2E2',  // vermelho claro
  extendedProps: { type: 'holiday', name: holiday.name },
};
```

---

## 10. LAYOUT E UX

```
┌─────────────────────────────────────────────────────────────────┐
│ TOPBAR: Logo | Filtros globais | Ano | Notificações | Perfil    │
├──────────────┬──────────────────────────────────────────────────┤
│ SIDEBAR      │  CALENDÁRIO (área máxima disponível)             │
│ recolhível   │                                                  │
│ redimensio-  │  FullCalendar multiMonthYear / dayGridMonth /    │
│ nável        │  timeGridWeek                                    │
│              │                                                  │
│ • Lista      │  Eventos coloridos por equipamento               │
│   equipa-    │  Feriados como background vermelho claro         │
│   mentos     │  Conflitos com borda vermelha                    │
│              │                                                  │
│ • Filtros    │                                                  │
│              │                                                  │
│ • Mapa       │                                                  │
│   de carga   │                                                  │
│   🟢🟡🔴   │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

### Requisitos de layout (obrigatórios)
- `width: 100vw`, `height: 100vh`, `overflow: hidden` no root
- Zero margens externas — o calendário ocupa todo o espaço disponível
- Sidebar com `resize: horizontal` via drag handle — mínimo 240px, máximo 480px
- Sidebar recolhível com animação CSS (`transform: translateX`)
- Layout responsivo para ultrawide (> 2560px): calendário expande, sidebar mantém largura
- Suporte a múltiplos monitores: o calendário deve adaptar-se ao viewport activo

---

## 11. SISTEMA DE PERMISSÕES

```typescript
type UserRole = 'admin' | 'planner' | 'engineer' | 'readonly';

const permissions: Record<UserRole, Permissions> = {
  admin: {
    canCreatePM: true, canEditPM: true, canDeletePM: true,
    canManageEquipment: true, canManageEngineers: true,
    canApproveSchedule: true, canSendEmails: true, canExportReports: true,
  },
  planner: {
    canCreatePM: true, canEditPM: true, canDeletePM: false,
    canManageEquipment: true, canManageEngineers: false,
    canApproveSchedule: true, canSendEmails: true, canExportReports: true,
  },
  engineer: {
    canCreatePM: false, canEditPM: true,  // apenas os seus eventos
    canDeletePM: false, canManageEquipment: false, canManageEngineers: false,
    canApproveSchedule: false, canSendEmails: false, canExportReports: true,
  },
  readonly: {
    canCreatePM: false, canEditPM: false, canDeletePM: false,
    canManageEquipment: false, canManageEngineers: false,
    canApproveSchedule: false, canSendEmails: false, canExportReports: true,
  },
};
```

---

## 12. PERFORMANCE (REQUISITOS MÍNIMOS)

- Suporte fluido a **500+ equipamentos** e **5.000+ eventos/ano**
- Virtualização de eventos fora do viewport (FullCalendar trata isto nativamente)
- Zustand stores com selectors granulares — sem re-renders desnecessários
- Supabase queries com índices explícitos (ver schema acima)
- Lazy loading de páginas com `React.lazy` + `Suspense`
- Service Worker (Workbox) para cache offline de dados recentes
- Debounce de 150ms em todos os filtros que disparam re-render do calendário

---

## 13. CONVENÇÕES DE CÓDIGO

```typescript
// Tipos sempre explícitos — sem `any`
// Componentes React: functional components + hooks
// Nomeação: PascalCase componentes, camelCase funções, UPPER_SNAKE_CASE constantes
// Ficheiros de store Zustand:
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Todas as chamadas Supabase são tipadas:
const { data, error } = await supabase
  .from('pm_events')
  .select('*, equipment(*), engineers(*)')
  .gte('start_date', startOfYear)
  .lte('end_date', endOfYear);

// Erros nunca silenciosos — sempre log + toast para o utilizador
// Datas: usar date-fns — nunca moment.js
// Imports: barrel exports por módulo (index.ts em cada pasta)
```

---

## 14. FASES DE DESENVOLVIMENTO (REFERÊNCIA)

| Fase | Meses | Objectivo principal |
|------|-------|---------------------|
| 1 | 1–3 | Setup infra + auth + CRUD base + calendário com PM manuais + feriados + conflitos básicos |
| 2 | 4–6 | Drag-and-drop + geração automática + Braquiterapia + mapa de carga + conflitos avançados |
| 3 | 7–9 | Microsoft 365 + Outlook bidirecional + emails automáticos + notificações |
| 4 | 10–12 | Relatórios Excel/PDF + permissões granulares + PWA + auditoria + go-live |

---

## 15. O QUE NÃO FAZER (RESTRIÇÕES ABSOLUTAS)

1. **NÃO instalar** `@fullcalendar/resource-*` (Premium — viola licença MIT)
2. **NÃO usar** Moment.js (deprecated) — usar `date-fns`
3. **NÃO usar** `any` em TypeScript — usar tipos explícitos ou `unknown`
4. **NÃO colocar** lógica de negócio em componentes React — vai para `lib/` ou `hooks/`
5. **NÃO fazer** queries Supabase dentro de componentes directamente — usar hooks ou stores
6. **NÃO permitir** drag-and-drop sem validação de conflitos antes do commit
7. **NÃO renderizar** PM em feriados — validar antes de qualquer operação de escrita
8. **NÃO usar** `localStorage` para dados de negócio — Supabase é a fonte de verdade
9. **NÃO criar** componentes com mais de 200 linhas — decompor em sub-componentes
10. **NÃO usar** CSS inline em React — apenas classes Tailwind ou CSS modules

---

*Prompt versão 1.0 — Junho 2025 — Projecto PM Radioterapia*
