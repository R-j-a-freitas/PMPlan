import type { Dictionary } from '../types';

// Gestão de utilizadores e o ecrã de saúde da infraestrutura.
export const users = {
  // ─── Utilizadores ────────────────────────────────────────────────────────────
  'users.title': ['Utilizadores', 'Usuarios'],
  'users.description': [
    'Contas de acesso à app. A palavra-passe definitiva é sempre definida pelo próprio, no primeiro login.',
    'Cuentas de acceso a la app. La contraseña definitiva la establece siempre el propio usuario, en el primer acceso.',
  ],
  'users.add': ['Adicionar utilizador', 'Añadir usuario'],
  'users.new': ['Novo utilizador', 'Nuevo usuario'],
  'users.create': ['Criar utilizador', 'Crear usuario'],
  'users.count': ['{count} utilizador', '{count} usuario'],
  'users.count_plural': ['{count} utilizadores', '{count} usuarios'],
  'users.empty': ['Ainda não há utilizadores registados.', 'Todavía no hay usuarios registrados.'],
  'users.restricted': ['Acesso restrito a administradores.', 'Acceso restringido a administradores.'],
  'users.emailRequired': ['Email (obrigatório)', 'Email (obligatorio)'],
  'users.noName': ['(sem nome)', '(sin nombre)'],
  'users.linkEngineer': ['Associar a engenheiro…', 'Asociar a ingeniero…'],
  'users.link': ['Associar…', 'Asociar…'],
  'users.state.pending': ['Aguarda 1º login', 'Pendiente 1.er acceso'],
  'users.state.active': ['Activa', 'Activa'],
  'users.createFailed': [
    'Falha ao criar utilizador (a Edge Function admin-create-user está deployed?).',
    'Error al crear el usuario (¿está desplegada la Edge Function admin-create-user?).',
  ],
  'users.createdWithPassword': [
    'Conta criada para {email}. Palavra-passe temporária (comunique-a uma única vez — será substituída no primeiro login):',
    'Cuenta creada para {email}. Contraseña temporal (comuníquela una sola vez — se sustituirá en el primer acceso):',
  ],
  'users.alreadyExisted': [
    'Já existia uma conta para {email} — o perfil foi actualizado. Para definir a palavra-passe, use “Esqueci-me da palavra-passe” no ecrã de login.',
    'Ya existía una cuenta para {email} — el perfil se ha actualizado. Para establecer la contraseña, use «He olvidado mi contraseña» en la pantalla de acceso.',
  ],

  // ─── Saúde do sistema ────────────────────────────────────────────────────────
  'health.title': ['Saúde do sistema', 'Estado del sistema'],
  'health.description': [
    'O que impede a base de dados de ser pausada, e o que a protege de ser perdida.',
    'Lo que impide que la base de datos se pause, y lo que la protege de perderse.',
  ],
  'health.restricted': [
    'Sem permissão para ver a saúde do sistema.',
    'Sin permiso para ver el estado del sistema.',
  ],
  'health.readAt': ['lido às {time}', 'leído a las {time}'],
  'health.refresh': ['↻ Actualizar', '↻ Actualizar'],
  'health.readFailed': [
    'Não foi possível ler o estado do sistema.',
    'No ha sido posible leer el estado del sistema.',
  ],
  'health.readFailedHint': [
    'Se o erro persistir, confirme no dashboard da Supabase se o projecto está activo — este ecrã lê da mesma base de dados que está a diagnosticar.',
    'Si el error persiste, compruebe en el panel de Supabase si el proyecto está activo — esta pantalla lee de la misma base de datos que está diagnosticando.',
  ],

  // Nível do semáforo
  'health.level.ok': ['OK', 'OK'],
  'health.level.warning': ['Aviso', 'Aviso'],
  'health.level.critical': ['Crítico', 'Crítico'],
  'health.level.unknown': ['Sem dados', 'Sin datos'],

  // Keep-alive
  'health.keepAlive': [
    'Keep-alive — impede a pausa por inactividade',
    'Keep-alive — impide la pausa por inactividad',
  ],
  'health.checkNow': ['Verificar agora', 'Comprobar ahora'],
  'health.checking': ['A verificar…', 'Comprobando…'],
  'health.neverWrote': [
    'Nenhuma origem automática alguma vez escreveu.',
    'Ningún origen automático ha escrito nunca.',
  ],
  'health.overall': [
    'Estado global (a origem automática mais recente).',
    'Estado global (el origen automático más reciente).',
  ],
  'health.col.source': ['Origem', 'Origen'],
  'health.col.lastPing': ['Último sinal', 'Última señal'],
  'health.col.age': ['Idade', 'Antigüedad'],
  'health.neverInstalled': ['nunca — por instalar', 'nunca — por instalar'],
  'health.informative': ['informativo', 'informativo'],
  'health.thresholds': [
    'Aviso acima de {warning} h, crítico acima de {critical} h, contados só sobre as origens automáticas. O projecto é pausado ao fim de 7 dias sem actividade.',
    'Aviso por encima de {warning} h, crítico por encima de {critical} h, contados solo sobre los orígenes automáticos. El proyecto se pausa a los 7 días sin actividad.',
  ],
  'health.checkNowHint': [
    'escreve na base de dados e conta as PMs — adia a contagem dos 7 dias, mas não substitui as origens automáticas.',
    'escribe en la base de datos y cuenta los PMs — aplaza el conteo de los 7 días, pero no sustituye a los orígenes automáticos.',
  ],
  'health.checkSuccess': [
    'Base de dados a responder: escrita registada e {count} PMs contadas.',
    'Base de datos respondiendo: escritura registrada y {count} PMs contados.',
  ],

  // Backup
  'health.backup': [
    'Backup — protege do que apaga os dados',
    'Backup — protege de lo que borra los datos',
  ],
  'health.downloadBackup': ['Descarregar cópia', 'Descargar copia'],
  'health.exporting': ['A exportar…', 'Exportando…'],
  'health.noAutomaticBackup': [
    'Nenhum backup automático registado. O backup ainda não foi instalado na VPS.',
    'Ningún backup automático registrado. El backup todavía no se ha instalado en la VPS.',
  ],
  'health.lastAutomatic': [
    'Último automático há {age} · {size}',
    'Último automático hace {age} · {size}',
  ],
  'health.objectCount': [' · {count} objectos', ' · {count} objetos'],
  'health.col.when': ['Quando', 'Cuándo'],
  'health.col.size': ['Dimensão', 'Tamaño'],
  'health.retention': [
    'Retenção dos automáticos: 7 diários, 4 semanais, 3 mensais, em /var/backups/pmplan na VPS. Procedimento de restauro em DOCS/DISASTER_RECOVERY.md.',
    'Retención de los automáticos: 7 diarios, 4 semanales, 3 mensuales, en /var/backups/pmplan en la VPS. Procedimiento de restauración en DOCS/DISASTER_RECOVERY.md.',
  ],
  'health.downloadHint': [
    'exporta os dados em JSON para este computador. Leva as linhas de todas as tabelas e a lista de contas; não leva schema, políticas nem palavras-passe — serve de última linha de defesa, não de substituto do backup da VPS.',
    'exporta los datos en JSON a este ordenador. Lleva las filas de todas las tablas y la lista de cuentas; no lleva esquema, políticas ni contraseñas — sirve de última línea de defensa, no de sustituto del backup de la VPS.',
  ],
  'health.backupSummary': [
    '{filename} — {rows} linhas de {tables} tabelas ({size}).',
    '{filename} — {rows} filas de {tables} tablas ({size}).',
  ],
  'health.backupNoAccounts': [
    ' Sem a lista de contas: a base de dados não a deixou ler.',
    ' Sin la lista de cuentas: la base de datos no ha permitido leerla.',
  ],

  'health.checkFailed': [
    'Falha ao verificar o estado do sistema.',
    'Error al comprobar el estado del sistema.',
  ],
  'health.exportFailed': [
    'Falha ao exportar a base de dados.',
    'Error al exportar la base de datos.',
  ],
  'health.backupNotRecorded': [
    'Cópia gravada em {filename}, mas não foi possível registá-la no histórico: {detail}',
    'Copia guardada en {filename}, pero no ha sido posible registrarla en el histórico: {detail}',
  ],

  // Idade formatada (formatAge em lib/systemHealth)
  'health.age.minutes': ['{value} min', '{value} min'],
  'health.age.hours': ['{value} h', '{value} h'],
  'health.age.days': ['{value} dias', '{value} días'],
} as const satisfies Dictionary;
