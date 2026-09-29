import type { ApprovalTrack } from '../types';

/** Tipo de fonte por omissão numa troca de fonte — o mesmo do SourceChangeModal. Os
 *  afterloaders da base instalada (Flexitron, mHDR, mPDR) usam todos Ir-192. */
export const DEFAULT_SOURCE_TYPE = 'Ir-192';

/** Etiqueta de uma PM gerada sem mais informação do que o equipamento. Nas fontes
 *  (via braquiterapia) a troca de fonte acontece sempre que a PM é agendada; o OTP, o
 *  Prostate e o simulacro variam de visita para visita e acrescentam-se à mão
 *  ("SCRX + PM + OTP"). Os aceleradores e o resto do equipamento levam só "PM". */
export function defaultCalendarLabel(track: ApprovalTrack): string {
  return track === 'brachytherapy' ? 'SCRX + PM' : 'PM';
}

/** Uma PM com esta etiqueta implica uma troca de fonte — o critério da importação de 2026. */
export function includesSourceChange(label: string | null | undefined): boolean {
  return label != null && /\bSCRX\b/.test(label);
}
