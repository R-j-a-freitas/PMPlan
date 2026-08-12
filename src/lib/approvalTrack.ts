import type {
  ApprovalTrack,
  EmailTemplateKey,
  EmailTemplateStep,
  EquipmentFull,
  Modality,
} from '../types';

/** Ordem em que as vias aparecem na interface — a geral primeiro, que é a maioria. */
export const APPROVAL_TRACKS: ApprovalTrack[] = ['standard', 'brachytherapy'];

export const APPROVAL_TRACK_LABELS: Record<ApprovalTrack, string> = {
  standard: 'Geral',
  brachytherapy: 'Braquiterapia',
};

/** Cor da etiqueta da via na tabela de aprovações. A braquiterapia leva um tom próprio
 *  (teal) para se distinguir de relance das cores dos estados, que são outra dimensão. */
export const APPROVAL_TRACK_COLORS: Record<ApprovalTrack, string> = {
  standard: '#64748B',
  brachytherapy: '#0D9488',
};

/** Indícios de braquiterapia no nome de uma modalidade. Além das palavras genéricas, os
 *  nomes dos afterloaders que se usam na prática: na base de dados as modalidades chamam-se
 *  "Flexitron", "Flexitron+OB+Prostate" e "mSelectron" — nenhuma tem "braqui" no nome, e um
 *  fallback só com as palavras genéricas não apanhava nenhuma delas.
 *  `selectron` cobre mSelectron/microSelectron/Selectron. */
const BRACHYTHERAPY_HINTS = ['braqui', 'brachy', 'flexitron', 'selectron'];

/** Rede de segurança para equipamento cuja `modality` (texto livre) não corresponde a
 *  nenhuma linha da tabela `modalities` — um valor importado de um Excel, ou uma
 *  modalidade entretanto removida. Sem isto, braquiterapia escrita à mão caía na via
 *  geral e ia dentro da carta dos aceleradores, que é exactamente o que se quer evitar. */
function looksLikeBrachytherapy(modalityName: string): boolean {
  // O intervalo das marcas combinatórias vai escrito com escapes, e não com os caracteres
  // literais: são invisíveis num editor e colam-se ao `[` anterior à primeira distracção
  // de quem editar esta linha.
  const normalized = modalityName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return BRACHYTHERAPY_HINTS.some((hint) => normalized.includes(hint));
}

/** Via de aprovação de uma modalidade. A tabela `modalities` manda (é lá que a via se
 *  configura, ver ModalityManagerModal); o palpite pelo nome só entra quando a modalidade
 *  não existe lá. */
export function resolveApprovalTrack(modalityName: string, modalities: Modality[]): ApprovalTrack {
  const known = modalities.find((modality) => modality.name === modalityName);
  if (known) return known.approval_track;
  return looksLikeBrachytherapy(modalityName) ? 'brachytherapy' : 'standard';
}

/** Via de um equipamento — atalho para o caso mais comum de resolveApprovalTrack. */
export function equipmentApprovalTrack(equipment: EquipmentFull, modalities: Modality[]): ApprovalTrack {
  return resolveApprovalTrack(equipment.modality, modalities);
}

/** Chave do template de email a usar numa etapa, consoante a via. A via de braquiterapia
 *  tem templates próprios (`brachy_*`, migração 0017) — o texto é editável à parte na tab
 *  "Templates das aprovações". */
export function templateKeyFor(track: ApprovalTrack, step: EmailTemplateStep): EmailTemplateKey {
  if (track === 'standard') return step;
  switch (step) {
    case 'engineer_approval':
      return 'brachy_engineer_approval';
    case 'client_proposal':
      return 'brachy_client_proposal';
    case 'signature_letter':
      return 'brachy_signature_letter';
  }
}
