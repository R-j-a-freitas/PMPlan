import type { Dictionary } from '../types';

// Painel de indicadores e relatórios.
export const reports = {
  // ─── Meses (abreviados, para os eixos dos gráficos) ──────────────────────────
  'month.1': ['Jan', 'Ene'],
  'month.2': ['Fev', 'Feb'],
  'month.3': ['Mar', 'Mar'],
  'month.4': ['Abr', 'Abr'],
  'month.5': ['Mai', 'May'],
  'month.6': ['Jun', 'Jun'],
  'month.7': ['Jul', 'Jul'],
  'month.8': ['Ago', 'Ago'],
  'month.9': ['Set', 'Sep'],
  'month.10': ['Out', 'Oct'],
  'month.11': ['Nov', 'Nov'],
  'month.12': ['Dez', 'Dic'],

  // ─── Relatórios ──────────────────────────────────────────────────────────────
  'reports.title': ['Relatórios', 'Informes'],
  'reports.description': [
    'As PMs do ano, filtradas e ordenadas à medida — prontas a exportar para Excel ou PDF.',
    'Los PMs del año, filtrados y ordenados a medida — listos para exportar a Excel o PDF.',
  ],
  'reports.exportPdf': ['Exportar PDF', 'Exportar PDF'],
  'reports.exportExcel': ['Exportar Excel', 'Exportar Excel'],
  'reports.file.title': ['Relatório de Manutenções Preventivas', 'Informe de Mantenimientos Preventivos'],
  'reports.file.subtitle': ['Ano {year}  ·  {count} PMs', 'Año {year}  ·  {count} PMs'],
  'reports.file.generated': ['Gerado em {when}', 'Generado el {when}'],
  'reports.file.generatedBy': ['Gerado em {when} por {who}', 'Generado el {when} por {who}'],
  'reports.file.page': ['Página {page} de {total}', 'Página {page} de {total}'],
  'reports.file.failed': ['Não foi possível gerar o ficheiro.', 'No se pudo generar el archivo.'],
  'reports.allFem': ['Todas', 'Todas'],
  'reports.allMasc': ['Todos', 'Todos'],
  'reports.count': ['{count} PM em {year}', '{count} PM en {year}'],
  'reports.count_plural': ['{count} PMs em {year}', '{count} PMs en {year}'],
  'reports.empty': [
    'Sem PMs para os filtros escolhidos.',
    'Sin PMs para los filtros elegidos.',
  ],

  // ─── Painel de indicadores ───────────────────────────────────────────────────
  'overview.title': ['Painel de Indicadores', 'Panel de Indicadores'],
  'overview.description': [
    'Leitura agregada do plano de PMs do ano: volume, cumprimento de quota e carga por engenheiro e por zona.',
    'Lectura agregada del plan de PMs del año: volumen, cumplimiento de cuota y carga por ingeniero y por zona.',
  ],
  'overview.loading': ['A carregar indicadores…', 'Cargando indicadores…'],

  // KPIs
  'overview.kpi.planned': ['PMs planeadas', 'PMs planificados'],
  'overview.kpi.plannedHint': ['{count} dias-PM no total', '{count} días-PM en total'],
  'overview.kpi.completion': ['Taxa de conclusão', 'Tasa de finalización'],
  'overview.kpi.completionHint': ['de {count} PMs', 'de {count} PMs'],
  'overview.kpi.unassigned': ['Por atribuir', 'Sin asignar'],
  'overview.kpi.unassignedHint': ['PMs sem engenheiro', 'PMs sin ingeniero'],
  'overview.kpi.quota': ['Cobertura de quota', 'Cobertura de cuota'],
  'overview.kpi.quotaHint': ['{within}/{total} equipamentos', '{within}/{total} equipos'],
  'overview.kpi.activeEquipment': ['Equipamentos activos', 'Equipos activos'],
  'overview.kpi.activeEquipmentHint': ['{count} no total', '{count} en total'],
  'overview.kpi.activeEngineers': ['Engenheiros activos', 'Ingenieros activos'],
  'overview.kpi.activeEngineersHint': ['{count} hospitais', '{count} hospitales'],

  // Painéis
  'overview.byStatus': ['Distribuição por estado', 'Distribución por estado'],
  'overview.byStatusSubtitle': ['{count} PMs', '{count} PMs'],
  'overview.noPmsThisYear': ['Sem PMs neste ano.', 'Sin PMs en este año.'],
  'overview.byMonth': ['PMs por mês', 'PMs por mes'],
  'overview.byMonthSubtitle': ['Segmentado por modalidade', 'Segmentado por modalidad'],
  'overview.byModality': ['PMs por modalidade', 'PMs por modalidad'],
  'overview.topHospitals': ['Top hospitais', 'Top hospitales'],
  'overview.topHospitalsSubtitle': [
    'Por número de PMs (8 primeiros)',
    'Por número de PMs (los 8 primeros)',
  ],
  'overview.noData': ['Sem dados.', 'Sin datos.'],
  'overview.engineerLoad': ['Carga por engenheiro', 'Carga por ingeniero'],
  'overview.engineerLoadSubtitle': [
    'Dias-PM atribuídos ÷ dias úteis do ano',
    'Días-PM asignados ÷ días laborables del año',
  ],
  'overview.noActiveEngineers': ['Sem engenheiros activos.', 'Sin ingenieros activos.'],
  'overview.zoneLoad': ['Carga por zona', 'Carga por zona'],
  'overview.zoneLoadSubtitle': [
    'Dias-PM pedidos ÷ capacidade da zona',
    'Días-PM solicitados ÷ capacidad de la zona',
  ],
  'overview.noZoneLoad': ['Sem zonas com carga.', 'Sin zonas con carga.'],
  'overview.quotaGaps': ['Equipamentos abaixo da quota', 'Equipos por debajo de la cuota'],
  'overview.quotaGapsSubtitle': [
    'PMs ainda por agendar para cumprir o contrato (PM/ano)',
    'PMs pendientes de programar para cumplir el contrato (PM/año)',
  ],
  'overview.quotaComplete': [
    'Todos os equipamentos activos têm as PMs do ano agendadas.',
    'Todos los equipos activos tienen los PMs del año programados.',
  ],
  'overview.col.scheduled': ['Agendadas', 'Programadas'],
  'overview.col.missing': ['Em falta', 'Pendientes'],
} as const satisfies Dictionary;
