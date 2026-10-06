import type { Dictionary } from '../types';

// Calendário, barra de vistas e coluna de planeamento (sidebar).
export const calendar = {
  // ─── Barra do calendário ─────────────────────────────────────────────────────
  'calendar.today': ['Hoje', 'Hoy'],
  'calendar.previousPeriod': ['Período anterior', 'Período anterior'],
  'calendar.nextPeriod': ['Período seguinte', 'Período siguiente'],
  'calendar.view.year': ['Ano', 'Año'],
  'calendar.view.quarter': ['Trimestre', 'Trimestre'],
  'calendar.view.month': ['Mês', 'Mes'],
  'calendar.view.week': ['Semana', 'Semana'],
  'calendar.density.one': ['1 linha', '1 línea'],
  'calendar.density.oneTitle': [
    'PMs compactas — cabem mais sobrepostas no mesmo dia',
    'PMs compactos — caben más superpuestos en el mismo día',
  ],
  'calendar.density.two': ['2 linhas', '2 líneas'],
  'calendar.density.twoTitle': [
    'PMs detalhadas — equipamento + hospital',
    'PMs detallados — equipo + hospital',
  ],
  'calendar.eventDelayed': ['Atrasado', 'Retrasado'],

  // ─── Feriados no calendário ──────────────────────────────────────────────────
  'calendar.holidayRegionalZone': [
    '{name} (feriado regional — {zone})',
    '{name} (festivo regional — {zone})',
  ],
  'calendar.holidayLocal': ['{name} (feriado local — {locality})', '{name} (festivo local — {locality})'],
  'calendar.holidayRegional': [
    '{name} (feriado regional — {locality})',
    '{name} (festivo regional — {locality})',
  ],
  'calendar.holidayNational': [
    '{name} (feriado nacional — {country})',
    '{name} (festivo nacional — {country})',
  ],

  // ─── Sidebar ─────────────────────────────────────────────────────────────────
  'sidebar.title': ['Planeamento', 'Planificación'],
  'sidebar.expand': ['Expandir sidebar', 'Expandir barra lateral'],
  'sidebar.collapse': ['Recolher sidebar', 'Contraer barra lateral'],
  'sidebar.expandSection': ['Expandir {name}', 'Expandir {name}'],
  'sidebar.collapseSection': ['Colapsar {name}', 'Contraer {name}'],
  'sidebar.zones': ['Zonas', 'Zonas'],
  'sidebar.engineers': ['Engenheiros', 'Ingenieros'],
  'sidebar.equipment': ['Equipamentos', 'Equipos'],
  'sidebar.allMasc': ['Todos', 'Todos'],
  'sidebar.noZone': ['Sem zona', 'Sin zona'],
  'sidebar.searchEquipment': ['Procurar equipamento…', 'Buscar equipo…'],
  'sidebar.equipmentSearch': ['Procurar equipamentos', 'Buscar equipos'],
  'sidebar.showAllInCalendar': [
    'Mostrar todos no calendário',
    'Mostrar todos en el calendario',
  ],

  // ─── Mapa de carga ───────────────────────────────────────────────────────────
  'load.zoneTitle': ['Carga de zona ({year})', 'Carga de zona ({year})'],
  'load.engineerTitle': ['Carga por engenheiro ({year})', 'Carga por ingeniero ({year})'],
  'load.zoneLabel': ['carga de zona', 'carga de zona'],
  'load.engineerLabel': ['carga por engenheiro', 'carga por ingeniero'],
  'load.howCalculated': ['Como é calculada a {label}', 'Cómo se calcula la {label}'],
  'load.formula': [
    'Carga = procura ÷ capacidade, em dias-PM',
    'Carga = demanda ÷ capacidad, en días-PM',
  ],
  'load.term.capacity': ['Capacidade', 'Capacidad'],
  'load.term.demand': ['Procura', 'Demanda'],
  'load.term.workingDays': ['Dias de trabalho', 'Días de trabajo'],
  'load.zone.capacity': [
    'a capacidade de cada engenheiro (dias de trabalho do ano, 1 dia-PM por dia) é repartida pelas zonas na proporção dos dias de PM que lá faz. Quem faz 3/4 dos seus dias de PM numa zona e 1/4 noutra dá 3/4 da capacidade à primeira e 1/4 à segunda.',
    'la capacidad de cada ingeniero (días de trabajo del año, 1 día-PM por día) se reparte entre las zonas en proporción a los días de PM que hace en cada una. Quien hace 3/4 de sus días de PM en una zona y 1/4 en otra da 3/4 de su capacidad a la primera y 1/4 a la segunda.',
  ],
  'load.zone.demand': [
    'duração (início e fim inclusive) das PMs activas com início nesse ano, cujo equipamento está nesta zona.',
    'duración (inicio y fin incluidos) de los PMs activos con inicio en ese año, cuyo equipo está en esta zona.',
  ],
  'load.zone.workingDays': [
    'os de cada engenheiro: segunda a sexta, mais os sábados/domingos em que ele tem PMs marcadas — a mesma conta da carga por engenheiro.',
    'los de cada ingeniero: de lunes a viernes, más los sábados/domingos en los que tiene PMs programados — la misma cuenta que la carga por ingeniero.',
  ],
  'load.zone.note1': [
    'Na prática, a carga de uma zona é a média da carga dos engenheiros que lá trabalham, pesada pelos dias que lá fazem. Conta quem faz as PMs, não quem está atribuído à zona: uma zona com quatro engenheiros atribuídos mas onde só um faz as PMs tem a carga desse engenheiro.',
    'En la práctica, la carga de una zona es la media de la carga de los ingenieros que trabajan en ella, ponderada por los días que hacen allí. Cuenta quien hace los PMs, no quien está asignado a la zona: una zona con cuatro ingenieros asignados pero en la que solo uno hace los PMs tiene la carga de ese ingeniero.',
  ],
  'load.zone.note2': [
    'PMs ainda sem engenheiro contam como trabalho dos engenheiros primários da zona. Um engenheiro sem PMs no ano dá a capacidade toda à sua zona primária (é folga disponível lá). Uma zona-mãe é a soma das filhas.',
    'Los PMs aún sin ingeniero cuentan como trabajo de los ingenieros principales de la zona. Un ingeniero sin PMs en el año aporta toda su capacidad a su zona principal (es holgura disponible allí). Una zona superior es la suma de las hijas.',
  ],
  'load.zone.note3': [
    'Feriados não são descontados aos dias de trabalho.',
    'Los festivos no se descuentan de los días de trabajo.',
  ],
  'load.engineer.capacity': [
    'dias de trabalho do ano (1 dia-PM por dia).',
    'días de trabajo del año (1 día-PM por día).',
  ],
  'load.engineer.demand': [
    'duração (início e fim inclusive) das PMs activas atribuídas a este engenheiro, com início nesse ano.',
    'duración (inicio y fin incluidos) de los PMs activos asignados a este ingeniero, con inicio en ese año.',
  ],
  'load.engineer.workingDays': [
    'segunda a sexta, mais os sábados/domingos em que ele tem PMs marcadas — um fim-de-semana trabalhado conta como dia normal.',
    'de lunes a viernes, más los sábados/domingos en los que tiene PMs programados — un fin de semana trabajado cuenta como día normal.',
  ],
  'load.engineer.note1': [
    'Feriados e férias não são descontados aos dias de trabalho.',
    'Los festivos y las vacaciones no se descuentan de los días de trabajo.',
  ],
  // ─── Conflitos de agendamento ────────────────────────────────────────────────
  // Emitidos por lib/conflictRules como chave + parâmetros (e não como texto), para a
  // biblioteca de regras se manter pura e o mesmo conflito se ler nas duas línguas.
  'conflict.engineerOverlap': [
    'O engenheiro já tem uma PM agendada entre {start} e {end}.',
    'El ingeniero ya tiene un PM programado entre {start} y {end}.',
  ],
  'conflict.holiday': [
    '{name} (feriado) — não é possível agendar PM neste dia.',
    '{name} (festivo) — no es posible programar un PM en este día.',
  ],
  'conflict.weekend': [
    '{date} é {day} — o contrato do equipamento não permite PMs neste dia.',
    '{date} es {day} — el contrato del equipo no permite PMs en este día.',
  ],
  'conflict.saturday': ['sábado', 'sábado'],
  'conflict.sunday': ['domingo', 'domingo'],
  'conflict.hospitalSameWeek': [
    'O hospital já tem outro equipamento em PM na mesma semana ({start} a {end}) — não pode haver PM no mesmo cliente na mesma semana.',
    'El hospital ya tiene otro equipo en PM la misma semana ({start} a {end}) — no puede haber PM en el mismo cliente la misma semana.',
  ],
  'conflict.citySameDay': [
    'Já existe outra PM em {city} entre {start} e {end} — só pode haver 1 PM por cidade por dia.',
    'Ya existe otro PM en {city} entre {start} y {end} — solo puede haber 1 PM por ciudad y día.',
  ],
  'conflict.pmQuota': [
    'Este equipamento já tem {count} PM(s) planeadas em {year} — o contrato prevê {max}/ano.',
    'Este equipo ya tiene {count} PM(s) planificados en {year} — el contrato prevé {max}/año.',
  ],
  'conflict.zoneLoad': [
    'Carga da zona em {year} a {percent}% da capacidade estimada ({demand}/{capacity} dias-PM).',
    'Carga de la zona en {year} al {percent}% de la capacidad estimada ({demand}/{capacity} días-PM).',
  ],
  'conflict.engineerUnavailable': [
    'Engenheiro indisponível no Outlook entre {start} e {end}.',
    'Ingeniero no disponible en Outlook entre {start} y {end}.',
  ],
} as const satisfies Dictionary;
