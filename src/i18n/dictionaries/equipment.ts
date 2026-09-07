import type { Dictionary } from '../types';

// Página de equipamentos: lista, linha editável, formulário de criação e gestão de
// modalidades.
export const equipment = {
  'equipment.title': ['Equipamentos', 'Equipos'],
  'equipment.description': [
    'A zona de cada equipamento vem sempre do hospital onde está instalado. A cor é a que o identifica no calendário.',
    'La zona de cada equipo viene siempre del hospital donde está instalado. El color es el que lo identifica en el calendario.',
  ],
  'equipment.add': ['Adicionar equipamento', 'Añadir equipo'],
  'equipment.new': ['Novo equipamento', 'Nuevo equipo'],
  'equipment.count': ['{count} equipamento', '{count} equipo'],
  'equipment.count_plural': ['{count} equipamentos', '{count} equipos'],
  'equipment.searchPlaceholder': [
    'Procurar em todos os campos…',
    'Buscar en todos los campos…',
  ],
  'equipment.empty': [
    'Ainda não há equipamentos registados.',
    'Todavía no hay equipos registrados.',
  ],
  'equipment.noMatch': [
    'Nenhum equipamento corresponde à pesquisa.',
    'Ningún equipo coincide con la búsqueda.',
  ],
  'equipment.createFailed': ['Falha ao criar equipamento.', 'Error al crear el equipo.'],
  'equipment.updateFailed': ['Falha ao actualizar equipamento.', 'Error al actualizar el equipo.'],
  'equipment.readFileFailed': ['Falha ao ler o ficheiro.', 'Error al leer el archivo.'],
  'equipment.importTitle': ['Importar equipamentos', 'Importar equipos'],
  'equipment.imported': [
    '{count} equipamento(s) importado(s) com sucesso.',
    '{count} equipo(s) importado(s) correctamente.',
  ],
  'equipment.importedWithErrors': [
    '{count} equipamento(s) importado(s), {failed} falharam: {rows}.',
    '{count} equipo(s) importado(s), {failed} han fallado: {rows}.',
  ],

  // ─── Colunas ─────────────────────────────────────────────────────────────────
  'equipment.col.serialNumber': ['Nº Série', 'Nº Serie'],
  'equipment.col.pmPerYear': ['PM/ano', 'PM/año'],
  'equipment.col.duration': ['Duração (dias)', 'Duración (días)'],
  'equipment.col.shutdown': ['Paragem', 'Parada'],
  'equipment.col.weekend': ['Fim-de-semana', 'Fin de semana'],
  'equipment.col.engineerPrimary': ['Eng. principal', 'Ing. principal'],
  'equipment.col.engineerSecondary': ['Eng. secundário', 'Ing. secundario'],
  'equipment.col.active': ['Activo', 'Activo'],

  // ─── Formulário ──────────────────────────────────────────────────────────────
  'equipment.field.hospitalRequired': ['Hospital… (obrigatório)', 'Hospital… (obligatorio)'],
  'equipment.field.serialNumber': ['Nº de Série', 'Nº de Serie'],
  'equipment.field.pmPerYear': ['{count}x PM/ano', '{count}x PM/año'],
  'equipment.field.pmPerYearShort': ['{count}x/ano', '{count}x/año'],
  'equipment.field.duration': ['Duração (dias)', 'Duración (días)'],
  'equipment.field.weekendTitle': [
    'Trabalho ao fim-de-semana (contrato)',
    'Trabajo en fin de semana (contrato)',
  ],
  'equipment.field.engineerPrimary': ['Engenheiro principal…', 'Ingeniero principal…'],
  'equipment.field.engineerSecondary': ['Engenheiro secundário…', 'Ingeniero secundario…'],
  'equipment.field.color': ['Cor no calendário', 'Color en el calendario'],
  'equipment.field.needsShutdown': ['Necessita paragem', 'Requiere parada'],
  'equipment.field.active': ['Activo', 'Activo'],
  'equipment.state.active': ['Activo', 'Activo'],
  'equipment.state.inactive': ['Inactivo', 'Inactivo'],

  // ─── Trabalho ao fim-de-semana ───────────────────────────────────────────────
  // Rótulos curtos para a célula da tabela; os longos para os selectores, onde há
  // espaço para dizer a regra por inteiro.
  'weekend.none': ['Só úteis', 'Solo laborables'],
  'weekend.saturday': ['Sáb', 'Sáb'],
  'weekend.both': ['Sáb+Dom', 'Sáb+Dom'],
  'weekend.none.long': ['Só dias úteis', 'Solo días laborables'],
  'weekend.saturday.long': ['Inclui sábado', 'Incluye sábado'],
  'weekend.both.long': ['Inclui sáb + dom', 'Incluye sáb + dom'],

  // ─── Modalidades ─────────────────────────────────────────────────────────────
  'modality.manage': ['✏️ Editar modalidades…', '✏️ Editar modalidades…'],
  'modality.manageTitle': ['Gerir modalidades', 'Gestionar modalidades'],
  'modality.manageHelp': [
    'Renomear propaga automaticamente aos equipamentos que a usam. Não é possível remover uma modalidade em uso. A via decide em que processo de aprovação entram os equipamentos: a via “Braquiterapia” gera uma proposta separada da geral, com validação do engenheiro, aprovação do cliente e carta próprias.',
    'Renombrar se propaga automáticamente a los equipos que la usan. No se puede eliminar una modalidad en uso. La vía decide en qué proceso de aprobación entran los equipos: la vía «Braquiterapia» genera una propuesta separada de la general, con validación del ingeniero, aprobación del cliente y carta propias.',
  ],
  'modality.newPlaceholder': ['Nova modalidade', 'Nueva modalidad'],
  'modality.rename': ['Renomear', 'Renombrar'],
  'modality.renamed': ['Modalidade renomeada para "{name}".', 'Modalidad renombrada a «{name}».'],
  'modality.addFailed': ['Falha ao adicionar modalidade.', 'Error al añadir la modalidad.'],
  'modality.renameFailed': ['Falha ao renomear modalidade.', 'Error al renombrar la modalidad.'],
  'modality.removeFailed': ['Falha ao remover modalidade.', 'Error al quitar la modalidad.'],
  'modality.trackTitle': [
    'Via de aprovação dos equipamentos desta modalidade.',
    'Vía de aprobación de los equipos de esta modalidad.',
  ],
  'modality.trackChanged': [
    '"{name}" passa a ser aprovada na via {track}.',
    '«{name}» pasa a aprobarse en la vía {track}.',
  ],
  'modality.trackFailed': ['Falha ao mudar a via.', 'Error al cambiar la vía.'],
  'modality.empty': ['Sem modalidades registadas.', 'Sin modalidades registradas.'],

  // ─── Vias de aprovação ───────────────────────────────────────────────────────
  'track.standard': ['Geral', 'General'],
  'track.brachytherapy': ['Braquiterapia', 'Braquiterapia'],
} as const satisfies Dictionary;
