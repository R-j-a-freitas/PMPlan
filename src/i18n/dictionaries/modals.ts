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
  'pm.planRemaining': ['Planear PM', 'Planificar PM'],
  'pm.planRemainingTitle': ['PM proposta em falta', 'PM propuesto pendiente'],
  'pm.planRemainingTitle_plural': ['{count} PMs propostas em falta', '{count} PM propuestos pendientes'],
  'pm.planRemainingHint': [
    'Datas espaçadas a partir desta PM, no mesmo dia da semana. Nada é gravado até confirmar.',
    'Fechas espaciadas a partir de este PM, en el mismo día de la semana. No se guarda nada hasta confirmar.',
  ],
  'pm.planRemainingReview': ['Rever', 'Revisar'],
  'pm.planRemainingUnsaved': [
    'Grave primeiro as alterações desta PM — a proposta parte da data gravada.',
    'Guarde primero los cambios de este PM — la propuesta parte de la fecha guardada.',
  ],
  'pm.planRemainingNone': [
    'Não foi possível propor datas para as PMs em falta.',
    'No fue posible proponer fechas para los PM pendientes.',
  ],
  'pm.planRemainingFailed': ['Falha ao propor datas.', 'Error al proponer fechas.'],
  'pm.planRemainingConfirm': ['Criar {count} PM', 'Crear {count} PM'],
  'pm.planRemainingConfirm_plural': ['Criar {count} PMs', 'Crear {count} PM'],
  'pm.planRemainingDone': ['{count} PM criada.', '{count} PM creado.'],
  'pm.planRemainingDone_plural': ['{count} PMs criadas.', '{count} PM creados.'],

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
    'Se o hospital já tiver alguma PM marcada em {year}, o plano ancora-se nessa data e as PMs seguintes mantêm o mesmo dia da semana, espaçadas ~3 meses (13 semanas para 4 PMs/ano). Caso contrário, ancora nas PMs de {previousYear} (data real de execução, ou a planeada) e, sem histórico, usa a distribuição base (Jan/Abr/Jul/Out para 4 PMs). Nunca gera conflitos de engenheiro (R1), feriados (R2), fins-de-semana não contratualizados (R5), hospital na mesma semana (R7) ou cidade no mesmo dia (R8, excepto na zona de Madrid, onde fica só o aviso).',
    'Si el hospital ya tiene algún PM programado en {year}, el plan se ancla en esa fecha y los PMs siguientes mantienen el mismo día de la semana, espaciados ~3 meses (13 semanas para 4 PMs/año). En caso contrario, se ancla en los PMs de {previousYear} (fecha real de ejecución, o la planificada) y, sin histórico, usa la distribución base (Ene/Abr/Jul/Oct para 4 PMs). Nunca genera conflictos de ingeniero (R1), festivos (R2), fines de semana no contratados (R5), hospital en la misma semana (R7) ni ciudad en el mismo día (R8, salvo en la zona de Madrid, donde queda solo el aviso).',
  ],
  // Regras completas, colapsadas por baixo do resumo (SchedulerRulesNote). Reflectem
  // lib/autoScheduler.ts, hooks/useBulkAutoScheduler.ts e lib/conflictRules.ts — se uma
  // regra mudar lá, muda aqui.
  'scheduler.rules.toggle': ['Ver todas as regras aplicadas', 'Ver todas las reglas aplicadas'],
  'scheduler.rules.anchor.title': ['1. De onde vem cada data (por esta ordem)', '1. De dónde sale cada fecha (por este orden)'],
  'scheduler.rules.anchor.current': [
    'PM já marcada em {year} em qualquer equipamento do mesmo hospital: a 1.ª proposta cai nessa data e as seguintes somam semanas inteiras (52 ÷ PMs/ano: 13 semanas para 4, 17 para 3, 26 para 2), sempre no mesmo dia da semana.',
    'PM ya programado en {year} en cualquier equipo del mismo hospital: la 1.ª propuesta cae en esa fecha y las siguientes suman semanas enteras (52 ÷ PMs/año: 13 semanas para 4, 17 para 3, 26 para 2), siempre en el mismo día de la semana.',
  ],
  'scheduler.rules.anchor.history': [
    'Sem PM em {year}: cada PM de {previousYear} (não cancelada) dá uma proposta, usando a data real de execução ou, se não houver, a data planeada. A data avança 52 semanas, para cair no mesmo dia da semana à mesma altura do ano.',
    'Sin PM en {year}: cada PM de {previousYear} (no cancelado) da una propuesta, usando la fecha real de ejecución o, si no la hay, la fecha planificada. La fecha avanza 52 semanas, para caer en el mismo día de la semana a la misma altura del año.',
  ],
  'scheduler.rules.anchor.base': [
    'Sem histórico: distribuição base, ao dia 15 — 1 PM/ano em Junho; 2 em Jan/Jul; 3 em Jan/Mai/Set; 4 em Jan/Abr/Jul/Out.',
    'Sin histórico: distribución base, el día 15 — 1 PM/año en junio; 2 en ene/jul; 3 en ene/may/sep; 4 en ene/abr/jul/oct.',
  ],
  'scheduler.rules.block.title': ['2. O que nunca é gerado', '2. Lo que nunca se genera'],
  'scheduler.rules.block.r1': [
    'R1 — Engenheiro em duas PMs ao mesmo tempo. Usa o engenheiro principal do equipamento; sem engenheiro principal, a proposta sai sem engenheiro e atribui-se na revisão.',
    'R1 — Ingeniero en dos PMs a la vez. Usa el ingeniero principal del equipo; sin ingeniero principal, la propuesta sale sin ingeniero y se asigna en la revisión.',
  ],
  'scheduler.rules.block.r2': [
    'R2 — Feriado em qualquer dia da PM: nacionais do país, fecho da zona, e o feriado municipal ou regional do hospital (concelho, Comunidade Autónoma ou fiesta local da cidade).',
    'R2 — Festivo en cualquier día del PM: nacionales del país, cierre de la zona, y el festivo municipal o regional del hospital (concejo, Comunidad Autónoma o fiesta local de la ciudad).',
  ],
  'scheduler.rules.block.r5': [
    'R5 — Fim-de-semana não contratado em qualquer dia da PM. Sem contrato: só dias úteis; contrato de sábado: sábado permitido; sábado e domingo: ambos permitidos.',
    'R5 — Fin de semana no contratado en cualquier día del PM. Sin contrato: solo días laborables; contrato de sábado: sábado permitido; sábado y domingo: ambos permitidos.',
  ],
  'scheduler.rules.block.r7': [
    'R7 — Dois equipamentos do mesmo hospital em PM na mesma semana (segunda a domingo), mesmo em dias diferentes.',
    'R7 — Dos equipos del mismo hospital en PM en la misma semana (lunes a domingo), aunque sea en días distintos.',
  ],
  'scheduler.rules.block.r8': [
    'R8 — Duas PMs na mesma cidade no mesmo dia (cidades diferentes no mesmo dia são permitidas). Excepção: na zona de Madrid não bloqueia — a data ancorada mantém-se e o choque fica como aviso na proposta.',
    'R8 — Dos PMs en la misma ciudad el mismo día (ciudades distintas el mismo día están permitidas). Excepción: en la zona de Madrid no bloquea — la fecha anclada se mantiene y el choque queda como aviso en la propuesta.',
  ],
  'scheduler.rules.block.year': ['Nenhuma proposta sai do ano {year}.', 'Ninguna propuesta sale del año {year}.'],
  'scheduler.rules.spacing.title': ['3. Espaçamento e fins-de-semana contratados', '3. Espaciado y fines de semana contratados'],
  'scheduler.rules.spacing.min': [
    'Pelo menos 60 dias entre o fim de uma PM e o início da seguinte do mesmo equipamento; se não, a seguinte avança semanas inteiras.',
    'Al menos 60 días entre el fin de un PM y el inicio del siguiente del mismo equipo; si no, el siguiente avanza semanas enteras.',
  ],
  'scheduler.rules.spacing.r4': [
    'R4 — Com fim-de-semana contratado, a PM termina no último dia contratado (sábado ou domingo) e estende-se para trás pela duração (ex: 3 dias com sábado e domingo = sexta a domingo). Estes equipamentos são planeados primeiro.',
    'R4 — Con fin de semana contratado, el PM termina en el último día contratado (sábado o domingo) y se extiende hacia atrás por la duración (ej: 3 días con sábado y domingo = viernes a domingo). Estos equipos se planifican primero.',
  ],
  'scheduler.rules.conflict.title': ['4. Quando a data calculada tem conflito', '4. Cuando la fecha calculada tiene conflicto'],
  'scheduler.rules.conflict.weeks': [
    'Procura a mesma data noutra semana, alternando para a frente e para trás até 8 semanas, para manter o dia da semana.',
    'Busca la misma fecha en otra semana, alternando hacia delante y hacia atrás hasta 8 semanas, para mantener el día de la semana.',
  ],
  'scheduler.rules.conflict.days': [
    'Se não houver, e o equipamento não tiver fim-de-semana contratado, desloca-se dia a dia até 13 dias (o dia da semana muda e isso fica indicado na proposta).',
    'Si no la hay, y el equipo no tiene fin de semana contratado, se desplaza día a día hasta 13 días (el día de la semana cambia y queda indicado en la propuesta).',
  ],
  'scheduler.rules.conflict.manual': [
    'Sem data livre, a PM fica na data calculada e marcada para revisão manual: o número de PMs contratado nunca é reduzido.',
    'Sin fecha libre, el PM queda en la fecha calculada y marcado para revisión manual: el número de PMs contratado nunca se reduce.',
  ],
  'scheduler.rules.batch.title': ['5. Geração em lote', '5. Generación por lotes'],
  'scheduler.rules.batch.count': [
    'Gera o número de PMs por ano do contrato de cada equipamento (campo PM/ano).',
    'Genera el número de PMs por año del contrato de cada equipo (campo PM/año).',
  ],
  'scheduler.rules.batch.cross': [
    'Os equipamentos são planeados um a um, e cada proposta conta como ocupada para os seguintes (engenheiro, hospital e cidade).',
    'Los equipos se planifican uno a uno, y cada propuesta cuenta como ocupada para los siguientes (ingeniero, hospital y ciudad).',
  ],
  'scheduler.rules.batch.replace': [
    'As PMs planeadas ou atrasadas de {year} dos equipamentos seleccionados são substituídas ao guardar; as restantes (concluídas, de outros equipamentos) mantêm-se e são respeitadas.',
    'Los PMs planificados o retrasados de {year} de los equipos seleccionados se sustituyen al guardar; los demás (completados, de otros equipos) se mantienen y se respetan.',
  ],
  'scheduler.rules.batch.proposal': [
    'Nada é gravado até confirmar a pré-visualização.',
    'Nada se guarda hasta confirmar la vista previa.',
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
  'scheduler.warningOnly': ['Aviso (não bloqueia):', 'Aviso (no bloquea):'],
  'scheduler.exportReview': ['Exportar lista para verificar', 'Exportar lista para revisar'],
  'scheduler.exportReview.file': ['pmplan-verificar-{year}.xlsx', 'pmplan-revisar-{year}.xlsx'],
  'scheduler.exportReview.sheet': ['Verificar', 'Revisar'],
  'scheduler.exportReview.equipment': ['Equipamento', 'Equipo'],
  'scheduler.exportReview.hospital': ['Hospital', 'Hospital'],
  'scheduler.exportReview.zone': ['Zona', 'Zona'],
  'scheduler.exportReview.pm': ['PM', 'PM'],
  'scheduler.exportReview.start': ['Início', 'Inicio'],
  'scheduler.exportReview.end': ['Fim', 'Fin'],
  'scheduler.exportReview.anchor': ['Origem da data', 'Origen de la fecha'],
  'scheduler.exportReview.manual': ['Revisão manual', 'Revisión manual'],
  'scheduler.exportReview.adjustment': ['Ajuste feito', 'Ajuste realizado'],
  'scheduler.exportReview.alerts': ['Conflitos e avisos', 'Conflictos y avisos'],
  'scheduler.exportReview.selected': ['Seleccionado para gravar', 'Seleccionado para guardar'],
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
