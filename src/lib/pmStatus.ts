import type { PMStatus } from '../types';

// Estado de uma PM — rótulo e cor num sítio só. Estavam definidos três vezes (o selector
// do formulário, o painel de indicadores e a tabela de relatórios, esta última a mostrar
// o valor cru da BD): a mesma PM aparecia como "Em curso", "in_progress" ou uma cor
// diferente consoante o ecrã. As cores vêm da paleta de estado validada (dataviz):
// verde=bom, azul/aqua/amarelo=categóricas, laranja=alerta, cinza=neutro.
export const PM_STATUS_META: Record<PMStatus, { label: string; color: string }> = {
  planned: { label: 'Planeada', color: '#2a78d6' },
  confirmed: { label: 'Confirmada', color: '#1baf7a' },
  in_progress: { label: 'Em curso', color: '#eda100' },
  completed: { label: 'Concluída', color: '#0ca30c' },
  delayed: { label: 'Atrasada', color: '#ec835a' },
  cancelled: { label: 'Cancelada', color: '#898781' },
};

/** Ordem de apresentação: segue o percurso real de uma PM, do plano à conclusão. */
export const PM_STATUS_ORDER: PMStatus[] = [
  'planned',
  'confirmed',
  'in_progress',
  'completed',
  'delayed',
  'cancelled',
];

export const PM_STATUS_OPTIONS = PM_STATUS_ORDER.map((value) => ({
  value,
  label: PM_STATUS_META[value].label,
}));

export function pmStatusLabel(status: PMStatus): string {
  return PM_STATUS_META[status]?.label ?? status;
}
