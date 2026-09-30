#!/usr/bin/env node
// PMPlan — cunha o JWT do papel de menor privilégio do keep-alive (migração 0011).
//
// O token resultante identifica-se perante o PostgREST como `pmplan_heartbeat`, um papel
// que só pode inserir heartbeats, contar PMs e purgar. Substitui a service_role key na
// VPS e no GitHub Actions.
//
// USO (o segredo entra por variável de ambiente, nunca por argumento — argumentos ficam
// visíveis no `ps` de qualquer utilizador da máquina e no histórico da shell):
//
//   SUPABASE_JWT_SECRET='...' SUPABASE_PROJECT_REF='...' node scripts/mint-heartbeat-token.mjs
//
// O segredo obtém-se em: Supabase → Project Settings → API → JWT Settings → JWT Secret.
// É o mesmo segredo com que as chaves anon e service_role foram assinadas; quem o tiver
// pode cunhar um token de qualquer papel, incluindo service_role. Não o guarde na VPS —
// só o token produzido aqui é que lá vai parar.
//
// Anos de validade opcionais (omissão: 5). A rotação faz-se voltando a correr isto e
// substituindo o token no /etc/pmplan/keep-alive.env e no GitHub Secret.
//
// Dependências: nenhuma. Só node:crypto.

import { createHmac } from 'node:crypto';

const SECRET = process.env.SUPABASE_JWT_SECRET;
const REF = process.env.SUPABASE_PROJECT_REF;
const YEARS = Number(process.env.TOKEN_YEARS ?? 5);
// Papéis de menor privilégio que este script pode cunhar — lista fechada, para um engano
// de escrita nunca produzir um token de papel com mais acesso (ex: service_role).
//   pmplan_heartbeat      keep-alive e verificador (migração 0011)
//   pmplan_holiday_sync   importação dos feriados do BOE (migração 0025)
const ALLOWED_ROLES = ['pmplan_heartbeat', 'pmplan_holiday_sync'];
const ROLE = process.env.TOKEN_ROLE ?? 'pmplan_heartbeat';

if (!ALLOWED_ROLES.includes(ROLE)) {
  console.error(`TOKEN_ROLE inválido: ${ROLE}. Permitidos: ${ALLOWED_ROLES.join(', ')}`);
  process.exit(1);
}

if (!SECRET || !REF) {
  console.error(
    'Faltam variáveis.\n' +
      "  SUPABASE_JWT_SECRET='<Project Settings → API → JWT Secret>'\n" +
      "  SUPABASE_PROJECT_REF='<ref do projecto>'\n" +
      'Exemplo:\n' +
      "  SUPABASE_JWT_SECRET='...' SUPABASE_PROJECT_REF='...' node scripts/mint-heartbeat-token.mjs",
  );
  process.exit(1);
}

const b64url = (input) => Buffer.from(input).toString('base64url');

const now = Math.floor(Date.now() / 1000);
const header = { alg: 'HS256', typ: 'JWT' };
// As claims espelham as das chaves anon/service_role do projecto (iss/ref/role/iat/exp) —
// é o formato que o PostgREST do Supabase espera. `role` é a única que interessa ao
// controlo de acesso: determina o SET ROLE que o PostgREST executa.
const payload = {
  iss: 'supabase',
  ref: REF,
  role: ROLE,
  iat: now,
  exp: now + Math.round(YEARS * 365.25 * 24 * 60 * 60),
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const signature = createHmac('sha256', SECRET).update(signingInput).digest('base64url');
const token = `${signingInput}.${signature}`;

// O token vai para stdout sozinho, para poder ser redireccionado ou copiado; tudo o resto
// vai para stderr, para não contaminar um `> ficheiro`.
console.error(`Papel:    ${ROLE}`);
console.error(`Projecto: ${REF}`);
console.error(`Validade: ${YEARS} anos (expira em ${new Date(payload.exp * 1000).toISOString().slice(0, 10)})`);
console.error('');
console.error(
  ROLE === 'pmplan_holiday_sync'
    ? 'Colar em SUPABASE_HOLIDAY_SYNC_TOKEN (/etc/pmplan/boe-holidays.env).'
    : 'Colar em SUPABASE_HEARTBEAT_TOKEN (/etc/pmplan/keep-alive.env e GitHub Secret).',
);
console.error('');
console.log(token);
