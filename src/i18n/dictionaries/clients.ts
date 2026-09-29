import type { Dictionary } from '../types';

// Hospitais, contactos, zonas e documentos assinados.
export const clients = {
  // ─── Países ──────────────────────────────────────────────────────────────────
  'country.PT': ['Portugal', 'Portugal'],
  'country.ES': ['Espanha', 'España'],

  // ─── Hospitais ───────────────────────────────────────────────────────────────
  'hospitals.title': ['Hospitais', 'Hospitales'],
  'hospitals.description': [
    'Cada hospital pertence sempre a uma zona — é dela que os equipamentos herdam a sua.',
    'Cada hospital pertenece siempre a una zona — es de ella que los equipos heredan la suya.',
  ],
  'hospitals.add': ['Adicionar hospital', 'Añadir hospital'],
  'hospitals.new': ['Novo hospital', 'Nuevo hospital'],
  'hospitals.count': ['{count} hospital', '{count} hospital'],
  'hospitals.count_plural': ['{count} hospitais', '{count} hospitales'],
  'hospitals.empty': ['Ainda não há hospitais registados.', 'Todavía no hay hospitales registrados.'],
  'hospitals.noMatch': [
    'Nenhum hospital corresponde à pesquisa.',
    'Ningún hospital coincide con la búsqueda.',
  ],
  'hospitals.createFailed': ['Falha ao criar hospital.', 'Error al crear el hospital.'],
  'hospitals.updateFailed': ['Falha ao actualizar hospital.', 'Error al actualizar el hospital.'],
  'hospitals.importTitle': ['Importar hospitais', 'Importar hospitales'],
  'hospitals.imported': [
    '{created} hospital(is) criado(s) e {updated} actualizado(s).',
    '{created} hospital(es) creado(s) y {updated} actualizado(s).',
  ],
  'hospitals.importedWithErrors': [
    '{created} criado(s), {updated} actualizado(s), {failed} falharam: {rows}.',
    '{created} creado(s), {updated} actualizado(s), {failed} han fallado: {rows}.',
  ],
  // A pré-visualização tem de dizer, linha a linha, se vai criar ou alterar: uma linha
  // cujo nome (ou ID Elekta) já existe actualiza o hospital em vez de criar outro.
  'hospitals.importNew': ['Novo: {name}', 'Nuevo: {name}'],
  'hospitals.importUpdate': ['Actualiza: {name}', 'Actualiza: {name}'],
  'hospitals.col.shortName': ['Nome curto', 'Nombre corto'],
  'hospitals.field.shortName': ['Nome curto (ex: IPO Porto)', 'Nombre corto (p. ej.: IPO Porto)'],
  'hospitals.field.zoneRequired': ['Zona… (obrigatório)', 'Zona… (obligatorio)'],
  'hospitals.field.ptLocality': ['Concelho (ex: Braga)', 'Municipio (p. ej.: Braga)'],
  'hospitals.field.esRegion': ['Comunidade Autónoma…', 'Comunidad Autónoma…'],
  'hospitals.field.city': ['Cidade (ex: Vigo)', 'Ciudad (p. ej.: Vigo)'],
  'hospitals.documents': ['Documentos', 'Documentos'],

  // ─── Contactos ───────────────────────────────────────────────────────────────
  'contacts.title': ['Contactos', 'Contactos'],
  'contacts.description': [
    'Todos os contactos registados nos hospitais, numa lista só. Cada contacto vive no hospital a que pertence.',
    'Todos los contactos registrados en los hospitales, en una sola lista. Cada contacto vive en el hospital al que pertenece.',
  ],
  'contacts.add': ['Adicionar contacto', 'Añadir contacto'],
  'contacts.new': ['Novo contacto', 'Nuevo contacto'],
  'contacts.count': ['{count} contacto', '{count} contacto'],
  'contacts.count_plural': ['{count} contactos', '{count} contactos'],
  'contacts.empty': ['Ainda não há contactos registados.', 'Todavía no hay contactos registrados.'],
  'contacts.noMatch': [
    'Nenhum contacto corresponde à pesquisa.',
    'Ningún contacto coincide con la búsqueda.',
  ],
  'contacts.addFailed': ['Falha ao adicionar contacto.', 'Error al añadir el contacto.'],
  'contacts.updateFailed': ['Falha ao actualizar contacto.', 'Error al actualizar el contacto.'],
  'contacts.deleteFailed': ['Falha ao apagar contacto.', 'Error al borrar el contacto.'],
  'contacts.confirmDelete': [
    'Apagar o contacto "{name}" de {hospital}?',
    '¿Borrar el contacto «{name}» de {hospital}?',
  ],
  'contacts.searchPlaceholder': ['Procurar em todos os campos…', 'Buscar en todos los campos…'],
  'contacts.edit': ['Editar contacto', 'Editar contacto'],
  'contacts.col.mobile': ['Móvel', 'Móvil'],
  'contacts.col.fax': ['Fax', 'Fax'],
  'contacts.col.track': ['Via', 'Vía'],
  'contacts.track.both': ['Ambas', 'Ambas'],
  'contacts.trackHelp': [
    'A via a que o contacto responde. "Ambas" — o normal — recebe a proposta dos aceleradores e a da braquiterapia; escolher uma via só faz sentido quando o hospital tem interlocutores diferentes para cada uma.',
    'La vía a la que responde el contacto. «Ambas» — lo normal — recibe la propuesta de los aceleradores y la de la braquiterapia; elegir una sola vía solo tiene sentido cuando el hospital tiene interlocutores distintos para cada una.',
  ],
  'contacts.field.primary': ['Contacto principal', 'Contacto principal'],
  'contacts.field.active': ['Activo (recebe emails)', 'Activo (recibe correos)'],
  'contacts.field.mobile': ['Telemóvel', 'Móvil'],
  'contacts.field.fax': ['Fax', 'Fax'],
  'contacts.field.notes': ['Notas', 'Notas'],
  'contacts.badge.primary': ['Principal', 'Principal'],
  'contacts.badge.inactive': ['Inactivo', 'Inactivo'],
  'contacts.importTitle': ['Importar contactos', 'Importar contactos'],
  'contacts.imported': [
    '{count} contacto(s) importado(s) com sucesso.',
    '{count} contacto(s) importado(s) correctamente.',
  ],
  'contacts.importedWithErrors': [
    '{count} contacto(s) importado(s), {failed} falharam: {rows}.',
    '{count} contacto(s) importado(s), {failed} han fallado: {rows}.',
  ],

  // ─── Zonas (Configurações) ───────────────────────────────────────────────────
  'settings.title': ['Configurações — Zonas', 'Configuración — Zonas'],
  'settings.description': [
    'A hierarquia de zonas é a origem de tudo: o hospital pertence a uma zona, o equipamento herda a do hospital, e o Team Leader da zona entra em cópia nos emails ao cliente.',
    'La jerarquía de zonas es el origen de todo: el hospital pertenece a una zona, el equipo hereda la del hospital, y el Team Leader de la zona entra en copia en los correos al cliente.',
  ],
  'settings.hierarchy': ['Hierarquia de zonas', 'Jerarquía de zonas'],
  'zones.add': ['Adicionar zona', 'Añadir zona'],
  'zones.new': ['Nova zona', 'Nueva zona'],
  'zones.empty': ['Ainda não há zonas definidas.', 'Todavía no hay zonas definidas.'],
  'zones.field.name': ['Nome (ex: Galiza)', 'Nombre (p. ej.: Galicia)'],
  'zones.field.code': ['Código (ex: ES-GAL)', 'Código (p. ej.: ES-GAL)'],
  'zones.field.noParent': ['(zona de topo, sem zona-mãe)', '(zona raíz, sin zona superior)'],
  'zones.field.noParentShort': ['(zona de topo)', '(zona raíz)'],
  'zones.field.inside': ['Dentro de: {zone}', 'Dentro de: {zone}'],
  'zones.teamLeaderLater': [
    'O Team Leader define-se depois, em “Editar” — uma zona-filha herda o da zona-mãe.',
    'El Team Leader se define después, en «Editar» — una zona hija hereda el de la zona superior.',
  ],
  'zones.teamLeaderTitle': [
    'Team Leader — entra em CC nos emails aos clientes desta zona',
    'Team Leader — entra en copia en los correos a los clientes de esta zona',
  ],
  'zones.teamLeaderInherited': ['TL herdado: {name}', 'TL heredado: {name}'],
  'zones.teamLeaderNoneOption': ['(sem Team Leader)', '(sin Team Leader)'],
  'zones.teamLeaderOwn': ['TL:', 'TL:'],
  'zones.teamLeaderInheritedShort': ['TL (herdado): {name}', 'TL (heredado): {name}'],
  'zones.teamLeaderMissing': ['Sem Team Leader', 'Sin Team Leader'],
  'zones.hospitalCount': ['{count} hospital', '{count} hospital'],
  'zones.hospitalCount_plural': ['{count} hospitais', '{count} hospitales'],
  'zones.manage': ['Gerir', 'Gestionar'],
  'zones.noHospitals': ['Sem hospitais nesta zona.', 'Sin hospitales en esta zona.'],
  'zones.engineersHere': ['Engenheiros desta zona', 'Ingenieros de esta zona'],
  'zones.noEngineers': ['Sem engenheiros registados.', 'Sin ingenieros registrados.'],
  'zones.primaryTag': ['(principal)', '(principal)'],
  'zones.inheritedFromParent': ['Herdados da zona-mãe', 'Heredados de la zona superior'],
  'zones.createFailed': ['Falha ao criar zona.', 'Error al crear la zona.'],
  'zones.updateFailed': ['Falha ao actualizar zona.', 'Error al actualizar la zona.'],
  'zones.deleteFailed': ['Falha ao eliminar zona.', 'Error al eliminar la zona.'],
  'zones.engineerZoneFailed': [
    'Falha ao actualizar a zona do engenheiro.',
    'Error al actualizar la zona del ingeniero.',
  ],
  'zones.none': ['Sem zonas criadas.', 'Sin zonas creadas.'],
  'zones.primaryOption': ['Principal: {zone}', 'Principal: {zone}'],

  // ─── Documentos assinados ────────────────────────────────────────────────────
  'documents.match.reference_code': ['Código', 'Código'],
  'documents.match.reference_codeTitle': [
    'Identificado pelo código da proposta no assunto — associação inequívoca.',
    'Identificado por el código de la propuesta en el asunto — asociación inequívoca.',
  ],
  'documents.match.subject_hospital': ['Assunto', 'Asunto'],
  'documents.match.subject_hospitalTitle': [
    'Identificado pelo nome do hospital no assunto do email.',
    'Identificado por el nombre del hospital en el asunto del correo.',
  ],
  'documents.match.sender_email': ['Remetente', 'Remitente'],
  'documents.match.sender_emailTitle': [
    'Identificado pelo email do remetente coincidir com um contacto do hospital — vale a pena confirmar.',
    'Identificado porque el email del remitente coincide con un contacto del hospital — conviene confirmarlo.',
  ],
  'documents.match.manual': ['Manual', 'Manual'],
  'documents.match.manualTitle': [
    'Associado à mão por um utilizador.',
    'Asociado manualmente por un usuario.',
  ],
  'documents.match.unmatched': ['Por associar', 'Por asociar'],
  'documents.match.unmatchedTitle': [
    'Não foi possível identificar o hospital.',
    'No ha sido posible identificar el hospital.',
  ],
  'documents.openFailed': ['Falha ao abrir o documento.', 'Error al abrir el documento.'],
  'documents.deleted': ['Documento apagado.', 'Documento borrado.'],
  'documents.deleteFailed': ['Falha ao apagar.', 'Error al borrar.'],
  'documents.delete': ['Apagar', 'Borrar'],
  'documents.hospitalEmpty': [
    'Sem documentos assinados recebidos. Chegam automaticamente quando o cliente responde à carta de assinatura com o PDF em anexo.',
    'Sin documentos firmados recibidos. Llegan automáticamente cuando el cliente responde a la carta de firma con el PDF adjunto.',
  ],
  'documents.noSubject': ['(sem assunto)', '(sin asunto)'],
  'documents.assignHospital': ['Associar a hospital…', 'Asociar a hospital…'],
  'documents.assigned': ['Documento associado ao hospital.', 'Documento asociado al hospital.'],
  'documents.assignFailed': ['Falha ao associar.', 'Error al asociar.'],
} as const satisfies Dictionary;
