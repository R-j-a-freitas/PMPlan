import type { PMStatus } from '../types';

// Cor de cada estado de uma PM, num sítio só — antes estava repetida pelo painel de
// indicadores e pela tabela de relatórios, e a mesma PM aparecia com cores diferentes
// consoante o ecrã. As cores vêm da paleta de estado validada (dataviz): verde=bom,
// azul/aqua/amarelo=categóricas, laranja=alerta, cinza=neutro.
//
// O RÓTULO não vive aqui: é traduzido a partir de PM_STATUS_KEYS (src/i18n/labels.ts),
// porque a aplicação existe em português e espanhol. Os relatórios exportados continuam
// a levar o valor cru da base de dados na coluna "Estado" (ver lib/exporters), que é o
// que sempre levaram — a exportação não muda com o idioma de quem carrega no botão.
export const PM_STATUS_COLORS: Record<PMStatus, string> = {
  planned: '#2a78d6',
  confirmed: '#1baf7a',
  in_progress: '#eda100',
  completed: '#0ca30c',
  delayed: '#ec835a',
  cancelled: '#898781',
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

