import type { Dictionary } from '../types';

// Página de engenheiros: lista, contas de login e o selector de zonas.
export const engineers = {
  'engineers.title': ['Engenheiros', 'Ingenieros'],
  'engineers.description': [
    'Um engenheiro pode cobrir várias zonas em simultâneo; a marcada com ★ é a principal.',
    'Un ingeniero puede cubrir varias zonas a la vez; la marcada con ★ es la principal.',
  ],
  'engineers.add': ['Adicionar engenheiro', 'Añadir ingeniero'],
  'engineers.new': ['Novo engenheiro', 'Nuevo ingeniero'],
  'engineers.count': ['{count} engenheiro', '{count} ingeniero'],
  'engineers.count_plural': ['{count} engenheiros', '{count} ingenieros'],
  'engineers.empty': ['Ainda não há engenheiros registados.', 'Todavía no hay ingenieros registrados.'],
  'engineers.noMatch': [
    'Nenhum engenheiro corresponde à pesquisa.',
    'Ningún ingeniero coincide con la búsqueda.',
  ],
  'engineers.createFailed': ['Falha ao criar engenheiro.', 'Error al crear el ingeniero.'],
  'engineers.updateFailed': ['Falha ao actualizar engenheiro.', 'Error al actualizar el ingeniero.'],
  'engineers.importTitle': ['Importar engenheiros', 'Importar ingenieros'],
  'engineers.imported': [
    '{count} engenheiro(s) importado(s) com sucesso.',
    '{count} ingeniero(s) importado(s) correctamente.',
  ],
  'engineers.importedWithErrors': [
    '{count} engenheiro(s) importado(s), {failed} falharam: {rows}.',
    '{count} ingeniero(s) importado(s), {failed} han fallado: {rows}.',
  ],
  'engineers.skills': ['Skills', 'Competencias'],
  'engineers.skillsPlaceholder': [
    'Skills (separadas por vírgula)',
    'Competencias (separadas por comas)',
  ],
  'engineers.skillsShort': ['Skills (vírgulas)', 'Competencias (comas)'],
  'engineers.active': ['Activo', 'Activo'],
  'engineers.state.active': ['Activo', 'Activo'],
  'engineers.state.inactive': ['Inactivo', 'Inactivo'],
  'engineers.confirmDelete': [
    'Eliminar o engenheiro {name}? Esta acção não pode ser desfeita.',
    '¿Eliminar al ingeniero {name}? Esta acción no se puede deshacer.',
  ],
  'engineers.deleted': ['Engenheiro {name} eliminado.', 'Ingeniero {name} eliminado.'],

  // ─── Motivos que impedem a eliminação ────────────────────────────────────────
  'engineers.deleteBlocked.account': [
    'Este engenheiro tem uma conta de login associada. Em "Editar", clique em "Remover acesso" antes de o eliminar.',
    'Este ingeniero tiene una cuenta de acceso asociada. En «Editar», pulse «Quitar acceso» antes de eliminarlo.',
  ],
  'engineers.deleteBlocked.pms': [
    'Este engenheiro tem PMs (manutenções) associadas. Reatribua ou remova essas PMs antes de o eliminar.',
    'Este ingeniero tiene PMs (mantenimientos) asociados. Reasigne o elimine esos PMs antes de eliminarlo.',
  ],
  'engineers.deleteBlocked.equipment': [
    'Este engenheiro está atribuído a equipamentos (principal/secundário). Reatribua esses equipamentos antes de o eliminar.',
    'Este ingeniero está asignado a equipos (principal/secundario). Reasigne esos equipos antes de eliminarlo.',
  ],
  'engineers.deleteBlocked.generic': [
    'Não é possível eliminar: existem registos associados a este engenheiro.',
    'No se puede eliminar: existen registros asociados a este ingeniero.',
  ],
  'engineers.deleteFailed': ['Falha ao eliminar o engenheiro.', 'Error al eliminar el ingeniero.'],

  // ─── Conta de login ──────────────────────────────────────────────────────────
  'engineers.login': ['Login', 'Acceso'],
  'engineers.login.none': ['Sem acesso', 'Sin acceso'],
  'engineers.login.create': ['Criar acesso', 'Crear acceso'],
  'engineers.login.creating': ['A criar…', 'Creando…'],
  'engineers.login.active': ['Activa', 'Activa'],
  'engineers.login.pendingFirstLogin': ['Activa · 1º login pendente', 'Activa · 1.er acceso pendiente'],
  'engineers.login.remove': ['Remover acesso', 'Quitar acceso'],
  'engineers.login.removing': ['A remover…', 'Quitando…'],
  'engineers.login.activeTitle': ['Conta de login activa', 'Cuenta de acceso activa'],
  'engineers.login.createTitle': [
    'Criar conta de login para este engenheiro',
    'Crear cuenta de acceso para este ingeniero',
  ],
  'engineers.login.created': [
    'Conta de login criada para {email}. O engenheiro pode agora definir a palavra-passe em "Esqueci-me da palavra-passe".',
    'Cuenta de acceso creada para {email}. El ingeniero ya puede establecer la contraseña en «He olvidado mi contraseña».',
  ],
  'engineers.login.linked': [
    'Conta de login associada a {email}. O engenheiro pode agora definir a palavra-passe em "Esqueci-me da palavra-passe".',
    'Cuenta de acceso asociada a {email}. El ingeniero ya puede establecer la contraseña en «He olvidado mi contraseña».',
  ],
  'engineers.login.createFailed': [
    'Falha ao criar a conta de login (a Edge Function admin-create-user está deployed?).',
    'Error al crear la cuenta de acceso (¿está desplegada la Edge Function admin-create-user?).',
  ],
  'engineers.login.confirmRemove': [
    'Remover o acesso de login de {name}? A conta será eliminada; poderá recriá-la depois com "Criar acesso".',
    '¿Quitar el acceso de {name}? La cuenta se eliminará; podrá volver a crearla después con «Crear acceso».',
  ],
  'engineers.login.removed': ['Acesso de login removido para {email}.', 'Acceso quitado para {email}.'],
  'engineers.login.removeFailed': [
    'Falha ao remover o acesso de login.',
    'Error al quitar el acceso.',
  ],

  // ─── Selector de zonas ───────────────────────────────────────────────────────
  'zoneSelect.label': ['Zonas (★ = principal)', 'Zonas (★ = principal)'],
  'zoneSelect.none': ['Sem zonas disponíveis.', 'Sin zonas disponibles.'],
  'zoneSelect.setPrimary': ['Definir como zona principal', 'Establecer como zona principal'],
} as const satisfies Dictionary;
