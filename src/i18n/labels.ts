import type { TFunction, TranslationKey } from './index';
import type { ApprovalTrack, ConflictResult, HealthLevel, PMStatus, WeekendWork } from '../types';

// Ponte entre os valores guardados na BD e as chaves de tradução. Fica num sítio só para
// um estado novo (ex.: mais um valor de weekend_work) obrigar a acrescentar a tradução
// aqui e falhar a compilação enquanto não estiver feita — em vez de aparecer cru no ecrã.

export const WEEKEND_WORK_KEYS: Record<WeekendWork, TranslationKey> = {
  none: 'weekend.none',
  saturday: 'weekend.saturday',
  both: 'weekend.both',
};

/** Versão por extenso, para os selectores (a curta é para a célula da tabela). */
export const WEEKEND_WORK_LONG_KEYS: Record<WeekendWork, TranslationKey> = {
  none: 'weekend.none.long',
  saturday: 'weekend.saturday.long',
  both: 'weekend.both.long',
};

export const PM_STATUS_KEYS: Record<PMStatus, TranslationKey> = {
  planned: 'status.planned',
  confirmed: 'status.confirmed',
  in_progress: 'status.in_progress',
  completed: 'status.completed',
  delayed: 'status.delayed',
  cancelled: 'status.cancelled',
};

export const APPROVAL_TRACK_KEYS: Record<ApprovalTrack, TranslationKey> = {
  standard: 'track.standard',
  brachytherapy: 'track.brachytherapy',
};

export const HEALTH_LEVEL_KEYS: Record<HealthLevel, TranslationKey> = {
  ok: 'health.level.ok',
  warning: 'health.level.warning',
  critical: 'health.level.critical',
  unknown: 'health.level.unknown',
};

/** Compõe a explicação de um conflito no idioma activo. As regras (lib/conflictRules)
 *  devolvem chave + parâmetros; é aqui que isso vira frase.
 *
 *  Um parâmetro cujo valor seja ele próprio uma chave conhecida (o nome do dia da semana,
 *  no conflito de fim-de-semana) é traduzido antes de entrar na frase — sem isto,
 *  aparecia "conflict.saturday" a meio do texto. */
export function conflictMessage(conflict: ConflictResult, t: TFunction): string | undefined {
  if (!conflict.messageKey) return undefined;
  const params = conflict.messageParams;
  if (!params) return t(conflict.messageKey);
  const resolved: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) {
    resolved[name] =
      typeof value === 'string' && NESTED_PARAM_KEYS.has(value) ? t(value as TranslationKey) : value;
  }
  return t(conflict.messageKey, resolved);
}

/** Valores de parâmetro que são, eles próprios, chaves a traduzir. Lista fechada de
 *  propósito: um parâmetro de dados (o nome de um feriado, de um hospital) nunca pode ser
 *  confundido com uma chave por acaso. */
const NESTED_PARAM_KEYS = new Set<string>(['conflict.saturday', 'conflict.sunday']);
