import type { Dictionary } from '../types';

// Barra superior, autenticação e o que emoldura a aplicação inteira.
export const nav = {
  // ─── Navegação ───────────────────────────────────────────────────────────────
  'nav.calendar': ['Calendário', 'Calendario'],
  'nav.overview': ['Painel', 'Panel'],
  'nav.equipment': ['Equipamentos', 'Equipos'],
  'nav.engineers': ['Engenheiros', 'Ingenieros'],
  'nav.clients': ['Hospitais', 'Hospitales'],
  'nav.contacts': ['Contactos', 'Contactos'],
  'nav.holidays': ['Feriados', 'Festivos'],
  'nav.reports': ['Relatórios', 'Informes'],
  'nav.settings': ['Configurações', 'Configuración'],
  'nav.approvals': ['Aprovações', 'Aprobaciones'],
  'nav.users': ['Utilizadores', 'Usuarios'],
  'nav.system': ['Sistema', 'Sistema'],

  // ─── Topbar ──────────────────────────────────────────────────────────────────
  'topbar.planningYear': ['Ano de planeamento', 'Año de planificación'],
  'topbar.plan': ['Plano {year}', 'Plan {year}'],
  'topbar.previousYear': ['Ano anterior', 'Año anterior'],
  'topbar.nextYear': ['Ano seguinte', 'Año siguiente'],
  'topbar.signOut': ['Sair', 'Salir'],
  'topbar.user': ['Utilizador', 'Usuario'],

  // ─── Papéis ──────────────────────────────────────────────────────────────────
  'role.admin': ['Administrador', 'Administrador'],
  'role.planner': ['Planeador', 'Planificador'],
  'role.engineer': ['Engenheiro', 'Ingeniero'],
  'role.readonly': ['Consulta', 'Consulta'],

  // ─── Login ───────────────────────────────────────────────────────────────────
  'login.subtitle': [
    'Inicie sessão para aceder ao planeamento.',
    'Inicie sesión para acceder a la planificación.',
  ],
  'login.password': ['Palavra-passe', 'Contraseña'],
  'login.submit': ['Entrar', 'Entrar'],
  'login.submitting': ['A entrar…', 'Entrando…'],
  'login.failed': ['Falha ao iniciar sessão.', 'Error al iniciar sesión.'],
  'login.forgot': ['Esqueci-me da palavra-passe', 'He olvidado mi contraseña'],
  'login.resetEmailRequired': [
    'Indique o email da conta para receber a nova palavra-passe.',
    'Indique el email de la cuenta para recibir la nueva contraseña.',
  ],
  'login.resetSent': [
    'Se existir uma conta com este email, enviámos uma nova palavra-passe temporária.',
    'Si existe una cuenta con este email, hemos enviado una nueva contraseña temporal.',
  ],
  'login.resetFailed': [
    'Falha ao enviar o email de recuperação.',
    'Error al enviar el correo de recuperación.',
  ],
  'login.passwordChanged': [
    'Palavra-passe definida. Inicie sessão com a nova palavra-passe.',
    'Contraseña establecida. Inicie sesión con la nueva contraseña.',
  ],

  // ─── Definir palavra-passe ───────────────────────────────────────────────────
  'setPassword.subtitle': [
    'Defina a sua palavra-passe para activar a conta.',
    'Establezca su contraseña para activar la cuenta.',
  ],
  'setPassword.new': ['Nova palavra-passe', 'Nueva contraseña'],
  'setPassword.confirm': ['Confirmar palavra-passe', 'Confirmar contraseña'],
  'setPassword.minLength': ['Pelo menos {count} caracteres.', 'Al menos {count} caracteres.'],
  'setPassword.tooShort': [
    'A palavra-passe tem de ter pelo menos {count} caracteres.',
    'La contraseña debe tener al menos {count} caracteres.',
  ],
  'setPassword.mismatch': ['As palavras-passe não coincidem.', 'Las contraseñas no coinciden.'],
  'setPassword.submit': ['Definir palavra-passe', 'Establecer contraseña'],
  'setPassword.submitting': ['A gravar…', 'Guardando…'],
  'setPassword.failed': [
    'Falha ao definir a palavra-passe. Peça um novo convite ao administrador.',
    'Error al establecer la contraseña. Solicite una nueva invitación al administrador.',
  ],
} as const satisfies Dictionary;
