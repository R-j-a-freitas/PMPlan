import type { Dictionary } from '../types';

// Janelas modais: importação, evento de PM, conflitos, trocas de fonte, contactos do
// hospital e o gerador automático de plano anual.
export const modals = {
  // ─── Importação de ficheiros (partilhada por Equipamentos/Engenheiros/Hospitais) ──
  'import.readFileFailed': ['Falha ao ler o ficheiro.', 'Error al leer el archivo.'],
  'import.rowNumber': ['linha {row}', 'fila {row}'],
  'import.validRows': ['{count} linha válida', '{count} fila válida'],
  'import.validRows_plural': ['{count} linhas válidas', '{count} filas válidas'],
  'import.errorRows': [
    ', {count} com erro (não será importada)',
    ', {count} con error (no se importará)',
  ],
  'import.errorRows_plural': [
    ', {count} com erro (não serão importadas)',
    ', {count} con error (no se importarán)',
  ],
  'import.confirm': ['Importar {count}', 'Importar {count}'],
  'import.importing': ['A importar…', 'Importando…'],
  'import.matches': ['Correspondências', 'Correspondencias'],
  'import.needsAttention': ['A precisar de atenção ({count})', 'Requieren atención ({count})'],
  'import.allMatches': ['Todas ({count})', 'Todas ({count})'],
  'import.pendingHelp': [
    'Estes valores do ficheiro não existem na aplicação. Escolha o registo correspondente e todas as linhas que os usam ficam válidas — o ficheiro não é alterado.',
    'Estos valores del archivo no existen en la aplicación. Elija el registro correspondiente y todas las filas que los usan quedarán válidas — el archivo no se modifica.',
  ],
  'import.allHelp': [
    'Todas as ligações que o ficheiro faz pelo nome. As que já casaram sozinhas também se podem trocar aqui, se apontarem ao registo errado.',
    'Todos los vínculos que el archivo establece por nombre. Los que ya han coincidido solos también se pueden cambiar aquí, si apuntan al registro equivocado.',
  ],
  'import.emptyValue': ['(vazio)', '(vacío)'],
  'import.rowsUsing': ['· {count} linha', '· {count} fila'],
  'import.rowsUsing_plural': ['· {count} linhas', '· {count} filas'],
  'import.manual': ['à mão', 'manual'],
  'import.unresolved': ['por resolver', 'sin resolver'],
  'import.matchAria': ['Corresponder {column} "{value}"', 'Corresponder {column} "{value}"'],
  'import.chooseRef': ['Escolher {noun}…', 'Elegir {noun}…'],
  'import.ref.zone': ['zona', 'zona'],
  'import.ref.hospital': ['hospital', 'hospital'],
  'import.ref.engineer': ['engenheiro', 'ingeniero'],
  'import.col.row': ['Linha', 'Fila'],
  'import.col.summary': ['Resumo', 'Resumen'],

  // ─── Modal de PM ─────────────────────────────────────────────────────────────
  'pm.new': ['Nova PM', 'Nuevo PM'],
  'pm.edit': ['Editar PM', 'Editar PM'],
  'pm.selectPlaceholder': ['Seleccionar…', 'Seleccionar…'],
  'pm.selectEquipmentEngineer': [
    'Seleccione equipamento e engenheiro.',
    'Seleccione equipo e ingeniero.',
  ],
  'pm.mustBeInPlanningYear': [
    'Esta PM tem de ficar dentro do ano de planeamento {year}.',
    'Este PM debe quedar dentro del año de planificación {year}.',
  ],
  'pm.conflict': ['Conflito ao agendar PM.', 'Conflicto al programar el PM.'],
  'pm.zoneOverload': ['Zona com carga elevada.', 'Zona con carga elevada.'],
  'pm.saveFailed': ['Falha ao gravar.', 'Error al guardar.'],
  'pm.dragSaveFailed': ['Falha ao gravar a PM.', 'Error al guardar el PM.'],
  'pm.deleteFailed': ['Falha ao eliminar.', 'Error al eliminar.'],
  'pm.plannedInYear': [
    'PMs planeadas em {year}: {count}/{max}',
    'PMs planificados en {year}: {count}/{max}',
  ],
  'pm.applyEngineerToAll': [
    'Aplicar este engenheiro à outra PM agendada deste equipamento em {year}',
    'Aplicar este ingeniero al otro PM programado de este equipo en {year}',
  ],
  'pm.applyEngineerToAll_plural': [
    'Aplicar este engenheiro às outras {count} PMs agendadas deste equipamento em {year}',
    'Aplicar este ingeniero a los otros {count} PM programados de este equipo en {year}',
  ],
  'pm.applyEngineerToAllHint': [
    'As PMs já concluídas ou canceladas mantêm o engenheiro actual.',
    'Los PM ya completados o cancelados mantienen el ingeniero actual.',
  ],
  'pm.applyAllConflict': [
    'Não foi possível aplicar às restantes — PM de {date}: {reason}',
    'No se pudo aplicar a los demás — PM de {date}: {reason}',
  ],
  'pm.applyAllDone': [
    'Engenheiro aplicado a mais {count} PM.',
    'Ingeniero aplicado a {count} PM más.',
  ],
  'pm.applyAllDone_plural': [
    'Engenheiro aplicado a mais {count} PMs.',
    'Ingeniero aplicado a {count} PM más.',
  ],

  // ─── Conflitos ───────────────────────────────────────────────────────────────
  'conflict.title': ['Conflito ao agendar PM', 'Conflicto al programar el PM'],
  'conflict.useSuggested': ['Usar data sugerida', 'Usar fecha sugerida'],
  'conflict.suggestedDate': ['Data alternativa sugerida:', 'Fecha alternativa sugerida:'],

  // ─── Trocas de fonte ─────────────────────────────────────────────────────────
  'source.title': ['Trocas de fonte — {equipment}', 'Cambios de fuente — {equipment}'],
  'source.empty': ['Sem trocas registadas.', 'Sin cambios registrados.'],
  'source.dateRequired': ['Indique a data planeada.', 'Indique la fecha planificada.'],
  'source.type': ['Tipo de fonte', 'Tipo de fuente'],
  'source.initialActivity': ['Actividade inicial (GBq)', 'Actividad inicial (GBq)'],
  'source.plannedDate': ['Data planeada', 'Fecha planificada'],
  'source.manufacturer': ['Fabricante', 'Fabricante'],

  // ─── Contactos do hospital ───────────────────────────────────────────────────
  'hospitalContacts.title': ['Contactos — {hospital}', 'Contactos — {hospital}'],
  'hospitalContacts.empty': ['Sem contactos registados.', 'Sin contactos registrados.'],
  'hospitalContacts.rolePlaceholder': [
    'Cargo (ex: Coordenador Técnico)',
    'Cargo (p. ej.: Coordinador Técnico)',
  ],
  'hospitalContacts.add': ['Adicionar contacto', 'Añadir contacto'],
  'hospitalContacts.saveFailed': ['Falha ao gravar contactos.', 'Error al guardar los contactos.'],

  // ─── Gerador automático de plano ─────────────────────────────────────────────
  'scheduler.open': ['⚡ Gerar Plano Anual', '⚡ Generar Plan Anual'],
  'scheduler.title': ['Geração Automática · Plano {year}', 'Generación Automática · Plan {year}'],
  'scheduler.setupDescription': [
    'Selecciona os equipamentos e o ano para gerar propostas de PM com base no histórico real.',
    'Selecciona los equipos y el año para generar propuestas de PM basadas en el histórico real.',
  ],
  'scheduler.reviewDescription': [
    '{proposals} propostas para {year} · {alerts}{selected} seleccionadas para guardar',
    '{proposals} propuestas para {year} · {alerts}{selected} seleccionadas para guardar',
  ],
  'scheduler.reviewAlerts': ['{count} com alertas · ', '{count} con alertas · '],
  'scheduler.planYear': ['Ano do plano', 'Año del plan'],
  'scheduler.equipment': ['Equipamentos', 'Equipos'],
  'scheduler.selectAll': ['Todos', 'Todos'],
  'scheduler.selectNone': ['Nenhum', 'Ninguno'],
  'scheduler.pmPerYearTag': ['({count}×/ano)', '({count}×/año)'],
  'scheduler.noActiveEquipment': ['Sem equipamentos activos.', 'Sin equipos activos.'],
  'scheduler.howItWorksTitle': ['Como funciona:', 'Cómo funciona:'],
  'scheduler.howItWorks': [
    'Se o hospital já tiver alguma PM marcada em {year}, o plano ancora-se nessa data e as PMs seguintes mantêm o mesmo dia da semana, espaçadas ~3 meses (13 semanas para 4 PMs/ano). Caso contrário, ancora nas datas reais de execução de {previousYear} (Regra 6) e, sem histórico, usa a distribuição base (Jan/Abr/Jul/Out para 4 PMs). Nunca gera conflitos de engenheiro (R1), feriados (R2) ou fins-de-semana não contratualizados (R5).',
    'Si el hospital ya tiene algún PM programado en {year}, el plan se ancla en esa fecha y los PMs siguientes mantienen el mismo día de la semana, espaciados ~3 meses (13 semanas para 4 PMs/año). En caso contrario, se ancla en las fechas reales de ejecución de {previousYear} (Regla 6) y, sin histórico, usa la distribución base (Ene/Abr/Jul/Oct para 4 PMs). Nunca genera conflictos de ingeniero (R1), festivos (R2) ni fines de semana no contratados (R5).',
  ],
  'scheduler.progress': [
    'A processar {current} de {total} equipamento(s)…',
    'Procesando {current} de {total} equipo(s)…',
  ],
  'scheduler.generate': ['Gerar propostas ({count})', 'Generar propuestas ({count})'],
  'scheduler.backToSelection': ['← Voltar a seleccionar', '← Volver a seleccionar'],
  'scheduler.previewInCalendar': ['Pré-visualizar no calendário', 'Vista previa en el calendario'],
  'scheduler.confirmSave': ['Confirmar e guardar ({count})', 'Confirmar y guardar ({count})'],
  'scheduler.confirmSavePms': ['Confirmar e guardar ({count} PM)', 'Confirmar y guardar ({count} PM)'],
  'scheduler.confirmSavePms_plural': [
    'Confirmar e guardar ({count} PMs)',
    'Confirmar y guardar ({count} PMs)',
  ],

  // Pré-visualização no calendário
  'scheduler.previewTitle': ['Pré-visualização · Plano {year}', 'Vista previa · Plan {year}'],
  'scheduler.previewHint': [
    '{count} PM proposta a tracejado no calendário. Confirma para guardar ou volta às propostas para ajustar.',
    '{count} PM propuesto en línea discontinua en el calendario. Confirma para guardar o vuelve a las propuestas para ajustar.',
  ],
  'scheduler.previewHint_plural': [
    '{count} PMs propostas a tracejado no calendário. Confirma para guardar ou volta às propostas para ajustar.',
    '{count} PMs propuestos en línea discontinua en el calendario. Confirma para guardar o vuelve a las propuestas para ajustar.',
  ],
  'scheduler.backToProposals': ['← Voltar às propostas', '← Volver a las propuestas'],

  // Propostas
  'scheduler.pmIndex': ['PM {index}', 'PM {index}'],
  'scheduler.anchorExisting': ['ancorado em PM já marcada', 'anclado en un PM ya programado'],
  'scheduler.anchorHistorical': ['ancorado no histórico', 'anclado en el histórico'],
  'scheduler.anchorBase': ['distribuição base', 'distribución base'],
  'scheduler.noEngineerTag': ['sem engenheiro', 'sin ingeniero'],
  'scheduler.needsReview': ['revisão manual necessária', 'revisión manual necesaria'],
  'scheduler.previousDate': [
    'Anterior: {date} · intervalo proposto: {days} dias',
    'Anterior: {date} · intervalo propuesto: {days} días',
  ],
  'scheduler.coherence': [
    'Coerência: {score}% · intervalo médio proposto: {days} dias',
    'Coherencia: {score}% · intervalo medio propuesto: {days} días',
  ],
  'scheduler.noConflicts': ['{count} PMs · sem conflitos', '{count} PMs · sin conflictos'],
  'scheduler.withAlerts': ['{count} com alertas', '{count} con alertas'],
  'scheduler.noProposals': ['Nenhuma proposta gerada.', 'Ninguna propuesta generada.'],
  'scheduler.lockedEquipment': [
    '{count} equipamento(s) já têm manutenção confirmada pelo cliente para {year}',
    '{count} equipo(s) ya tienen mantenimiento confirmado por el cliente para {year}',
  ],
  'scheduler.lockedEquipmentHint': [
    '— não é necessário gerar novamente: {names}.',
    '— no es necesario volver a generar: {names}.',
  ],
  'scheduler.alertsTitle': ['{count} proposta(s) com alertas', '{count} propuesta(s) con alertas'],
  'scheduler.alertsHint': [
    '— marcadas a laranja/vermelho abaixo. Podes guardar na mesma (ficam com status planned) e corrigir manualmente no calendário.',
    '— marcadas en naranja/rojo más abajo. Puedes guardarlas igualmente (quedan con estado planned) y corregirlas manualmente en el calendario.',
  ],

  // Gravação
  'scheduler.loadYearFailed': [
    'Falha ao carregar os eventos do ano alvo.',
    'Error al cargar los eventos del año objetivo.',
  ],
  'scheduler.checkExistingFailed': [
    'Falha ao verificar PMs existentes.',
    'Error al comprobar los PMs existentes.',
  ],
  'scheduler.confirmReplace': [
    '{equipment} equipamento(s) já têm {pms} PM(s) planeada(s) para {year}. Serão substituídas pelas novas propostas. Esta acção não pode ser desfeita. Continuar?',
    '{equipment} equipo(s) ya tienen {pms} PM(s) planificado(s) para {year}. Se sustituirán por las nuevas propuestas. Esta acción no se puede deshacer. ¿Continuar?',
  ],
  'scheduler.nothingSelected': [
    'Nenhum evento seleccionado para guardar.',
    'Ningún evento seleccionado para guardar.',
  ],
  'scheduler.savedOk': [
    '{count} PM(s) criada(s) com sucesso para o plano {year}.',
    '{count} PM(s) creado(s) correctamente para el plan {year}.',
  ],
  'scheduler.deleteOldFailed': [
    'PMs novas criadas, mas não foi possível remover as antigas — remove-as manualmente no calendário.',
    'PMs nuevos creados, pero no ha sido posible eliminar los antiguos — elimínalos manualmente en el calendario.',
  ],
  'scheduler.sourceChangesFailed': [
    'PMs gravadas, mas não foi possível actualizar as trocas de fonte — regista-as à mão no equipamento.',
    'PMs guardados, pero no ha sido posible actualizar los cambios de fuente — regístralos a mano en el equipo.',
  ],
  'scheduler.savedWithoutEngineer': [
    '{message} ({count} sem engenheiro atribuído — atribui-os manualmente no calendário)',
    '{message} ({count} sin ingeniero asignado — asígnalos manualmente en el calendario)',
  ],
  'scheduler.saveFailed': ['Falha ao guardar os eventos.', 'Error al guardar los eventos.'],
} as const satisfies Dictionary;
