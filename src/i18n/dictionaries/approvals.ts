import type { Dictionary } from '../types';

// Página de aprovações: workflow por hospital/via, templates de email e destinatários
// em CC.
//
// ATENÇÃO: o que aqui está é a INTERFACE de quem envia. O conteúdo do que sai — assunto e
// corpo dos emails, e a carta em PDF — continua a vir dos templates da base de dados
// escolhidos pelo país do hospital (email_templates.country, migração 0003) e do
// letterPdf. Traduzir esta página não muda uma vírgula do que o cliente recebe.
export const approvals = {
  'approvals.title': [
    'Aprovações — Envio de Propostas a Clientes',
    'Aprobaciones — Envío de Propuestas a Clientes',
  ],
  'approvals.description': [
    'Ano de planeamento {year}. Cada linha é um processo independente — confirma com o engenheiro, envia a proposta ao cliente e, depois de aprovada, envia a carta de assinatura. Os equipamentos de Braquiterapia têm a sua própria linha: são validados, aprovados e assinados à parte do resto do hospital. A via de cada modalidade define-se em Equipamentos → Editar modalidades.',
    'Año de planificación {year}. Cada fila es un proceso independiente — confirma con el ingeniero, envía la propuesta al cliente y, una vez aprobada, envía la carta de firma. Los equipos de Braquiterapia tienen su propia fila: se validan, aprueban y firman aparte del resto del hospital. La vía de cada modalidad se define en Equipos → Editar modalidades.',
  ],

  // ─── Separadores ─────────────────────────────────────────────────────────────
  'approvals.tab.workflow': ['Aprovações', 'Aprobaciones'],
  'approvals.tab.templates': ['Templates das aprovações', 'Plantillas de las aprobaciones'],
  'approvals.tab.recipients': ['Destinatários em CC', 'Destinatarios en copia'],
  'approvals.noTemplatePermission': [
    'Sem permissões para editar templates.',
    'Sin permisos para editar plantillas.',
  ],
  'approvals.noRecipientPermission': [
    'Sem permissões para gerir destinatários.',
    'Sin permisos para gestionar destinatarios.',
  ],

  // ─── Lista ───────────────────────────────────────────────────────────────────
  'approvals.noPms': ['Sem PMs agendadas para {year}.', 'Sin PMs programados para {year}.'],
  'approvals.noPmsInTrack': [
    'Sem PMs agendadas nesta via para {year}.',
    'Sin PMs programados en esta vía para {year}.',
  ],
  'approvals.trackFilter': ['Via:', 'Vía:'],
  'approvals.allTracks': ['Todas', 'Todas'],
  'approvals.selectedCount': ['{count} seleccionado', '{count} seleccionado'],
  'approvals.selectedCount_plural': ['{count} seleccionados', '{count} seleccionados'],
  'approvals.advanceSelected': ['Avançar seleccionados', 'Avanzar seleccionados'],
  'approvals.col.track': ['Via', 'Vía'],
  'approvals.col.teamLeader': ['Team Leader', 'Team Leader'],
  'approvals.col.pmDays': ['Dias-PM', 'Días-PM'],
  'approvals.noTeamLeader': ['Sem TL', 'Sin TL'],
  'approvals.noTeamLeaderTitle': [
    'A zona "{zone}" não tem Team Leader — define-o em Configurações → Zonas.',
    'La zona «{zone}» no tiene Team Leader — defínelo en Configuración → Zonas.',
  ],
  'approvals.teamLeaderOff': [
    '{email} — desligado em "Destinatários em CC"; não entra em cópia.',
    '{email} — desactivado en «Destinatarios en copia»; no entra en copia.',
  ],
  'approvals.previewPdfTitle': [
    'Ver a carta como o cliente a vai receber',
    'Ver la carta tal como la recibirá el cliente',
  ],
  'approvals.downloadIcsTitle': ['Descarregar as PMs em .ics', 'Descargar los PMs en .ics'],
  'approvals.processing': ['A processar…', 'Procesando…'],
  'approvals.restart': ['Recomeçar', 'Reiniciar'],

  // ─── Vias ────────────────────────────────────────────────────────────────────
  'approvals.trackTitle.standard': [
    'Processo geral do hospital — todos os equipamentos que não são de uma via própria.',
    'Proceso general del hospital — todos los equipos que no pertenecen a una vía propia.',
  ],
  'approvals.trackTitle.brachytherapy': [
    'Processo independente: validação, aprovação, carta e assinatura próprias dos equipamentos de Braquiterapia.',
    'Proceso independiente: validación, aprobación, carta y firma propias de los equipos de Braquiterapia.',
  ],
  'approvals.bundleLabelWithTrack': ['{hospital} ({track})', '{hospital} ({track})'],

  // ─── Fases ───────────────────────────────────────────────────────────────────
  'stage.draft': ['Por enviar', 'Por enviar'],
  'stage.pending_engineer': ['Aguarda engenheiro', 'Pendiente del ingeniero'],
  'stage.engineer_approved': ['Aprovado (engenheiro)', 'Aprobado (ingeniero)'],
  'stage.pending_client': ['Aguarda cliente', 'Pendiente del cliente'],
  'stage.client_approved': ['Aprovado (cliente)', 'Aprobado (cliente)'],
  'stage.letter_sent': ['Carta enviada', 'Carta enviada'],
  'stage.signed': ['Assinado', 'Firmado'],
  'stage.rejected': ['Rejeitado', 'Rechazado'],

  // ─── Acções ──────────────────────────────────────────────────────────────────
  'approvals.action.send_engineer': ['Enviar a engenheiro', 'Enviar al ingeniero'],
  'approvals.action.resend_engineer': ['Reenviar a engenheiro', 'Reenviar al ingeniero'],
  'approvals.action.send_zone_team': ['Enviar a equipa de zona', 'Enviar al equipo de zona'],
  'approvals.action.resend_zone_team': ['Reenviar a equipa de zona', 'Reenviar al equipo de zona'],
  'approvals.zoneTeamTitle': [
    'Equipa da zona "{zone}": {names}',
    'Equipo de la zona «{zone}»: {names}',
  ],
  'approvals.noZoneTeam': [
    'A zona "{zone}" não tem engenheiros activos com email — atribui-os em Configurações → Zonas.',
    'La zona «{zone}» no tiene ingenieros activos con email — asígnalos en Configuración → Zonas.',
  ],
  'approvals.viewSignedLetter': ['Carta assinada', 'Carta firmada'],
  'approvals.viewSignedLetterTitle': [
    'Abrir o documento assinado devolvido pelo cliente ({filename})',
    'Abrir el documento firmado devuelto por el cliente ({filename})',
  ],
  'approvals.signedAutomatically': [
    'Assinado automaticamente: o documento do cliente chegou em {date}.',
    'Firmado automáticamente: el documento del cliente llegó el {date}.',
  ],
  'approvals.action.confirm_engineer': [
    'Marcar aprovado (engenheiro)',
    'Marcar aprobado (ingeniero)',
  ],
  'approvals.action.send_client': ['Enviar a cliente', 'Enviar al cliente'],
  'approvals.action.resend_client': ['Reenviar a cliente', 'Reenviar al cliente'],
  'approvals.action.confirm_client': ['Marcar aprovado (cliente)', 'Marcar aprobado (cliente)'],
  'approvals.action.send_letter': ['Enviar carta de assinatura', 'Enviar carta de firma'],
  'approvals.action.resend_letter': ['Reenviar carta', 'Reenviar carta'],
  'approvals.action.resend_letter_updated': [
    'Reenviar carta actualizada',
    'Reenviar carta actualizada',
  ],
  'approvals.action.confirm_signed': ['Marcar como assinado', 'Marcar como firmado'],

  // ─── Resultados ──────────────────────────────────────────────────────────────
  'approvals.emailSent': ['{bundle}: email enviado.', '{bundle}: correo enviado.'],
  'approvals.stageUpdated': ['{bundle}: estado actualizado.', '{bundle}: estado actualizado.'],
  'approvals.actionFailed': ['Falha na acção.', 'Error en la acción.'],
  'approvals.resetDone': ['{bundle}: workflow reiniciado.', '{bundle}: flujo reiniciado.'],
  'approvals.resetFailed': ['Falha ao reiniciar.', 'Error al reiniciar.'],
  'approvals.templateMissing': [
    'Template "{key}" ({country}) não encontrado.',
    'Plantilla «{key}» ({country}) no encontrada.',
  ],
  'approvals.noEngineerEmail': [
    'Sem email de engenheiro associado às PMs de {bundle}.',
    'Sin email de ingeniero asociado a los PMs de {bundle}.',
  ],
  'approvals.noClientEmail': [
    'Sem contactos de email para {hospital} — adiciona em Hospitais → Contactos.',
    'Sin contactos de email para {hospital} — añádelos en Hospitales → Contactos.',
  ],

  // ─── Cartas assinadas recebidas ──────────────────────────────────────────────
  'approvals.signedDocs.title': [
    '{count} carta assinada recebida',
    '{count} carta firmada recibida',
  ],
  'approvals.signedDocs.title_plural': [
    '{count} cartas assinadas recebidas',
    '{count} cartas firmadas recibidas',
  ],
  'approvals.signedDocs.subtitle': [
    'Chegam sozinhas quando o cliente responde à carta com o PDF assinado — a linha correspondente passa a "Assinado".',
    'Llegan solas cuando el cliente responde a la carta con el PDF firmado — la fila correspondiente pasa a «Firmado».',
  ],
  'approvals.signedDocs.empty': [
    'Ainda não chegou nenhuma carta assinada neste ano.',
    'Todavía no ha llegado ninguna carta firmada este año.',
  ],
  'approvals.signedDocs.col.file': ['Documento', 'Documento'],
  'approvals.signedDocs.col.receivedAt': ['Recebido em', 'Recibido el'],
  'approvals.signedDocs.col.from': ['Enviado por', 'Enviado por'],
  'approvals.signedDocs.col.match': ['Associação', 'Asociación'],

  // ─── Documentos por associar ─────────────────────────────────────────────────
  'approvals.tab.orphans': ['Documentos por associar', 'Documentos por asociar'],
  'orphans.title': ['{count} documento por associar', '{count} documento por asociar'],
  'orphans.title_plural': ['{count} documentos por associar', '{count} documentos por asociar'],
  'orphans.subtitle': [
    'Documentos assinados que chegaram por email sem que fosse possível perceber automaticamente de que hospital ou de que via são — sem código, sem nome do hospital no assunto, ou com um remetente que é contacto de vários hospitais. Escolhe o hospital (e, se souberes, a via) e carrega em Associar: se a carta estava à espera de assinatura, passa a "Assinado".',
    'Documentos firmados que han llegado por correo sin que fuera posible saber automáticamente de qué hospital o de qué vía son — sin código, sin el nombre del hospital en el asunto, o con un remitente que es contacto de varios hospitales. Elige el hospital (y, si lo sabes, la vía) y pulsa Asociar: si la carta estaba pendiente de firma, pasa a «Firmado».',
  ],
  'orphans.empty': [
    'Nada por associar — todos os documentos recebidos estão arquivados no hospital e na via certos.',
    'Nada por asociar — todos los documentos recibidos están archivados en el hospital y la vía correctos.',
  ],
  'orphans.col.subject': ['Assunto', 'Asunto'],
  'orphans.col.assign': ['Associar a', 'Asociar a'],
  'orphans.kind.no_hospital': ['Sem hospital', 'Sin hospital'],
  'orphans.kind.no_track': ['Via por definir', 'Vía por definir'],
  'orphans.candidates': ['{count} hospitais possíveis', '{count} hospitales posibles'],
  'orphans.candidates_plural': ['{count} hospitais possíveis', '{count} hospitales posibles'],
  'orphans.candidatesGroup': [
    'Possíveis (o remetente é contacto destes)',
    'Posibles (el remitente es contacto de estos)',
  ],
  'orphans.allHospitals': ['Todos os hospitais', 'Todos los hospitales'],
  'orphans.trackAuto': ['Via: automática (pelo ficheiro)', 'Vía: automática (por el archivo)'],
  'orphans.trackHint': [
    'Sem escolher, a via é deduzida do nome do ficheiro ou, se o hospital só tiver uma carta à espera, é essa.',
    'Sin elegir, la vía se deduce del nombre del archivo o, si el hospital solo tiene una carta pendiente, es esa.',
  ],
  'orphans.assign': ['Associar', 'Asociar'],
  'orphans.noPermission': ['Sem permissões para associar.', 'Sin permisos para asociar.'],
  'orphans.hospitalsNotice': [
    '{count} documento assinado por associar a um hospital.',
    '{count} documento firmado por asociar a un hospital.',
  ],
  'orphans.hospitalsNotice_plural': [
    '{count} documentos assinados por associar a um hospital.',
    '{count} documentos firmados por asociar a un hospital.',
  ],
  'orphans.openQueue': ['Abrir documentos por associar', 'Abrir documentos por asociar'],

  // ─── Modais de confirmação ───────────────────────────────────────────────────
  'approvals.resendLetterTitle': ['Reenviar carta para assinatura', 'Reenviar carta para firma'],
  'approvals.resendLetterConfirm': ['Reenviar carta', 'Reenviar carta'],
  'approvals.resendLetterBody': [
    'Vai ser enviada a {bundle} uma nova carta, gerada com as datas de PM que estão neste momento no calendário. Como a proposta já estava assinada, o estado volta a “Carta enviada” e a assinatura registada é apagada — a que existia refere-se ao plano anterior, e passa a ser preciso obter a assinatura da versão nova.',
    'Se enviará a {bundle} una nueva carta, generada con las fechas de PM que están ahora mismo en el calendario. Como la propuesta ya estaba firmada, el estado vuelve a «Carta enviada» y la firma registrada se borra — la que existía se refiere al plan anterior, y habrá que obtener la firma de la nueva versión.',
  ],
  'approvals.resetTitle': ['Reiniciar workflow de aprovações', 'Reiniciar flujo de aprobaciones'],
  'approvals.resetConfirm': ['Sim, reiniciar', 'Sí, reiniciar'],
  'approvals.resetBody': [
    'Quer mesmo reiniciar o processo de {bundle}? O estado volta a “Por enviar” e todas as confirmações já registadas (engenheiro, cliente, carta e assinatura) são apagadas — implica revalidar de novo com o engenheiro e com o cliente.',
    '¿Seguro que quiere reiniciar el proceso de {bundle}? El estado vuelve a «Por enviar» y todas las confirmaciones ya registradas (ingeniero, cliente, carta y firma) se borran — implica volver a validar con el ingeniero y con el cliente.',
  ],

  // ─── Editor de templates ─────────────────────────────────────────────────────
  'templates.title': ['Templates de email', 'Plantillas de correo'],
  'templates.subtitle': [
    'Cada etapa tem uma versão PT e uma ES — o envio usa a do país do hospital. Cada via tem o seu conjunto próprio: editar a braquiterapia não mexe na via geral.',
    'Cada etapa tiene una versión PT y una ES — el envío usa la del país del hospital. Cada vía tiene su propio conjunto: editar la braquiterapia no afecta a la vía general.',
  ],
  'templates.placeholders': ['Placeholders', 'Marcadores'],
  'templates.placeholdersInline': ['Placeholders:', 'Marcadores:'],
  'templates.trackOption': ['Via {track}', 'Vía {track}'],
  'templates.step.engineer_approval': ['Aprovação', 'Aprobación'],
  'templates.step.client_proposal': ['Proposta', 'Propuesta'],
  'templates.step.signature_letter': ['Carta de assinatura', 'Carta de firma'],
  'templates.audience.engineer': ['para o engenheiro', 'para el ingeniero'],
  'templates.audience.client': ['para o cliente', 'para el cliente'],
  'templates.edit': ['Editar', 'Editar'],
  'templates.missing': [
    'Ainda não existe na base de dados (migração 0017 por aplicar?) — o envio desta etapa falha até ser criado.',
    'Todavía no existe en la base de datos (¿migración 0017 sin aplicar?) — el envío de esta etapa falla hasta que se cree.',
  ],
  'templates.editTitle': ['{step} · {country} · Via {track}', '{step} · {country} · Vía {track}'],
  'templates.subject': ['Assunto', 'Asunto'],
  'templates.subjectPlaceholder': ['Assunto do email', 'Asunto del correo'],
  'templates.body': ['Corpo', 'Cuerpo'],
  'templates.bodyPlaceholder': ['Corpo do email', 'Cuerpo del correo'],
  'templates.saveFailed': ['Falha ao gravar template.', 'Error al guardar la plantilla.'],

  // ─── Destinatários em CC ─────────────────────────────────────────────────────
  'recipients.title': ['Destinatários em CC', 'Destinatarios en copia'],
  'recipients.intro': [
    'Estas pessoas entram em CC em todos os envios de propostas e cartas aos clientes. Desliga o interruptor Ativo para tirar alguém do loop (ex.: durante testes) sem apagar o registo — volta a ligar quando quiseres.',
    'Estas personas entran en copia en todos los envíos de propuestas y cartas a los clientes. Desactiva el interruptor Activo para sacar a alguien del circuito (p. ej.: durante las pruebas) sin borrar el registro — vuelve a activarlo cuando quieras.',
  ],
  'recipients.senderNote': [
    'O utilizador que envia ({email}) entra sempre em CC automaticamente.',
    'El usuario que envía ({email}) entra siempre en copia automáticamente.',
  ],
  'recipients.repliesNote': [
    'Estas pessoas recebem também as respostas dos clientes com os documentos assinados (entram em Reply-To da carta de assinatura, a par de {mailbox}).',
    'Estas personas reciben también las respuestas de los clientes con los documentos firmados (entran en Reply-To de la carta de firma, junto a {mailbox}).',
  ],
  'recipients.includeTeamLeaders': [
    'Incluir os Team Leaders das zonas',
    'Incluir a los Team Leaders de las zonas',
  ],
  'recipients.includeTeamLeadersHint': [
    'O TL da zona de cada cliente entra em CC nos emails que lhe são enviados. Desliga durante os testes para não incomodar os TLs — os envios continuam a funcionar, apenas sem eles em cópia.',
    'El TL de la zona de cada cliente entra en copia en los correos que se le envían. Desactívalo durante las pruebas para no molestar a los TL — los envíos siguen funcionando, solo que sin ellos en copia.',
  ],
  'recipients.empty': ['Sem destinatários configurados.', 'Sin destinatarios configurados.'],
  'recipients.activeTitle': ['Ativo — recebe os emails', 'Activo — recibe los correos'],
  'recipients.active': ['Ativo', 'Activo'],
  'recipients.inactive': ['Inativo', 'Inactivo'],
  'recipients.nameOptional': ['Nome (opcional)', 'Nombre (opcional)'],
  'recipients.emailPlaceholder': ['pessoa@empresa.com', 'persona@empresa.com'],
  'recipients.invalidEmail': ['Email inválido.', 'Email no válido.'],
  'recipients.duplicate': ['Esse email já está na lista.', 'Ese email ya está en la lista.'],
  'recipients.addFailed': ['Falha ao adicionar destinatário.', 'Error al añadir el destinatario.'],
  'recipients.updateFailed': [
    'Falha ao actualizar destinatário.',
    'Error al actualizar el destinatario.',
  ],
  'recipients.deleteFailed': ['Falha ao remover destinatário.', 'Error al quitar el destinatario.'],
  'recipients.settingFailed': [
    'Falha ao actualizar a definição.',
    'Error al actualizar el ajuste.',
  ],
} as const satisfies Dictionary;
