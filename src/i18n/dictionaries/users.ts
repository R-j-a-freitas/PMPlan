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
  // Quadro de privilégios por função
  'users.priv.title': ['Privilégios de cada função', 'Privilegios de cada función'],
  'users.priv.subtitle': [
    'O que cada função pode ver e alterar na aplicação.',
    'Lo que cada función puede ver y modificar en la aplicación.',
  ],
  'users.priv.col.area': ['Área', 'Área'],
  'users.priv.area.calendar': ['Calendário de manutenções (PMs)', 'Calendario de mantenimientos (PMs)'],
  'users.priv.area.equipment': ['Equipamentos', 'Equipos'],
  'users.priv.area.hospitals': ['Hospitais e contactos', 'Hospitales y contactos'],
  'users.priv.area.holidays': ['Feriados', 'Festivos'],
  'users.priv.area.engineers': ['Engenheiros', 'Ingenieros'],
  'users.priv.area.zones': ['Zonas e atribuição de engenheiros', 'Zonas y asignación de ingenieros'],
  'users.priv.area.reports': ['Relatórios e exportação', 'Informes y exportación'],
  'users.priv.area.approvals': [
    'Aprovações, emails a clientes e documentos assinados',
    'Aprobaciones, emails a clientes y documentos firmados',
  ],
  'users.priv.area.users': ['Utilizadores', 'Usuarios'],
  'users.priv.area.system': ['Saúde do sistema e backups', 'Estado del sistema y backups'],
  'users.priv.level.edit': ['Ver e editar', 'Ver y editar'],
  'users.priv.level.view': ['Só ver', 'Solo ver'],
  'users.priv.level.yes': ['Sim', 'Sí'],
  'users.priv.level.none': ['Sem acesso', 'Sin acceso'],
  'users.priv.note.plannerDelete': [
    'O Planeador só pode apagar manutenções ainda não realizadas (planeadas ou atrasadas); o Administrador apaga qualquer uma.',
    'El Planificador solo puede borrar mantenimientos aún no realizados (planificados o retrasados); el Administrador borra cualquiera.',
  ],
  'users.priv.note.allZones': [
    'Todas as funções vêem todas as zonas.',
    'Todas las funciones ven todas las zonas.',
  ],
  'users.priv.note.enforced': [
    'Estas regras são aplicadas pela base de dados, não só pela interface: um botão escondido não é a única barreira.',
    'Estas reglas las aplica la base de datos, no solo la interfaz: un botón oculto no es la única barrera.',
  ],

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

  // Ficheiros guardados na VPS
  'health.vps.title': [
    'Cópias guardadas na VPS',
    'Copias guardadas en la VPS',
  ],
  'health.vps.reload': ['Recarregar lista', 'Recargar lista'],
  'health.vps.empty': [
    'Ainda não há ficheiros em /var/backups/pmplan.',
    'Todavía no hay archivos en /var/backups/pmplan.',
  ],
  'health.vps.unavailable': ['Não foi possível ler a lista da VPS:', 'No se ha podido leer la lista de la VPS:'],
  'health.vps.col.date': ['Data', 'Fecha'],
  'health.vps.col.content': ['Conteúdo', 'Contenido'],
  'health.vps.col.retention': ['Retenção', 'Retención'],
  'health.vps.kind.data': ['Dados (pg_dump)', 'Datos (pg_dump)'],
  'health.vps.kind.users': ['Contas (auth.users)', 'Cuentas (auth.users)'],
  'health.vps.tier.daily': ['diário', 'diario'],
  'health.vps.tier.weekly': ['semanal', 'semanal'],
  'health.vps.tier.monthly': ['mensal', 'mensual'],
  'health.vps.download': ['Descarregar', 'Descargar'],
  'health.vps.downloading': ['A descarregar…', 'Descargando…'],
  'health.vps.downloaded': ['{name} descarregado.', '{name} descargado.'],
  'health.vps.downloadFailed': [
    'Falha ao descarregar o ficheiro da VPS.',
    'Error al descargar el archivo de la VPS.',
  ],
  'health.vps.hint': [
    'Estes são os backups completos (schema, dados e contas), tal como estão no disco da VPS. Guardar um fora da VPS de vez em quando protege também contra a perda da própria VPS. Restaurar com pg_restore — ver DOCS/DISASTER_RECOVERY.md.',
    'Estos son los backups completos (esquema, datos y cuentas), tal como están en el disco de la VPS. Guardar uno fuera de la VPS de vez en cuando protege también contra la pérdida de la propia VPS. Restaurar con pg_restore — ver DOCS/DISASTER_RECOVERY.md.',
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
