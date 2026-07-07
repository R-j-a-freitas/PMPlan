const CONFLICT_CLASS_NAME = 'pmplan-event-conflict';

// Overlay de conflitos: aplica borda vermelha (ver index.css) a eventos com conflito
// activo por resolver — consumido via eventClassNames no MainCalendar.
export function getConflictClassNames(hasConflict: boolean): string[] {
  return hasConflict ? [CONFLICT_CLASS_NAME] : [];
}
