import type { Dictionary } from '../types';

// Página de feriados: as quatro categorias por âmbito e as regras recorrentes.
export const holidays = {
  'holidays.title': ['Feriados', 'Festivos'],
  'holidays.description': [
    'Os feriados de cada zona são reflectidos no calendário e respeitados pelo gerador do plano anual.',
    'Los festivos de cada zona se reflejan en el calendario y los respeta el generador del plan anual.',
  ],
  'holidays.add': ['Adicionar feriado', 'Añadir festivo'],
  'holidays.new': ['Novo feriado', 'Nuevo festivo'],
  'holidays.namePlaceholder': ['Nome do feriado', 'Nombre del festivo'],
  'holidays.ptLocality': ['Concelho (vazio = nacional)', 'Municipio (vacío = nacional)'],
  'holidays.esRegion': [
    'Comunidade Autónoma… (vazio = nacional)',
    'Comunidad Autónoma… (vacío = nacional)',
  ],
  'holidays.noZone': ['Sem zona específica', 'Sin zona específica'],
  'holidays.zoneClosure': ['Fecho da zona: {zone}', 'Cierre de la zona: {zone}'],
  'holidays.createFailed': ['Falha ao criar feriado.', 'Error al crear el festivo.'],
  'holidays.deleteFailed': ['Falha ao eliminar feriado.', 'Error al eliminar el festivo.'],
  'holidays.emptyCategory': [
    'Sem feriados nesta categoria para o ano seleccionado.',
    'Sin festivos en esta categoría para el año seleccionado.',
  ],
  'holidays.col.source': ['Origem', 'Origen'],
  'holidays.source.manual': ['Manual', 'Manual'],
  'holidays.source.auto': ['Nager.Date', 'Nager.Date'],

  // ─── Categorias ──────────────────────────────────────────────────────────────
  'holidays.nationalPT': ['Feriados Nacionais Portugueses', 'Festivos Nacionales Portugueses'],
  'holidays.nationalES': ['Feriados Nacionais Espanhóis', 'Festivos Nacionales Españoles'],
  'holidays.localPT': ['Feriados Locais de Portugal', 'Festivos Locales de Portugal'],
  'holidays.localPTHint': [
    'Concelhos onde existem equipamentos instalados.',
    'Municipios donde hay equipos instalados.',
  ],
  'holidays.regionalES': ['Feriados Regionais de Espanha', 'Festivos Regionales de España'],
  'holidays.regionalESHint': [
    'Comunidades Autónomas onde existem equipamentos instalados.',
    'Comunidades Autónomas donde hay equipos instalados.',
  ],

  // ─── Regras recorrentes ──────────────────────────────────────────────────────
  'holidays.rules.title': [
    'Regras Recorrentes (Feriados Locais PT)',
    'Reglas Recurrentes (Festivos Locales PT)',
  ],
  'holidays.rules.subtitle': [
    'Definida uma vez, a regra projecta-se para qualquer ano — fixa (mesmo dia todos os anos) ou móvel (dias relativos à Páscoa: Segunda-feira de Páscoa = +1, Corpo de Deus = +60).',
    'Definida una vez, la regla se proyecta a cualquier año — fija (el mismo día todos los años) o móvil (días relativos a la Pascua: Lunes de Pascua = +1, Corpus Christi = +60).',
  ],
  'holidays.rules.add': ['Adicionar regra', 'Añadir regla'],
  'holidays.rules.new': ['Nova regra recorrente', 'Nueva regla recurrente'],
  'holidays.rules.empty': [
    'Sem regras para concelhos com equipamentos instalados.',
    'Sin reglas para municipios con equipos instalados.',
  ],
  'holidays.rules.locality': ['Concelho', 'Municipio'],
  'holidays.rules.recurrence': ['Recorrência', 'Recurrencia'],
  'holidays.rules.fixed': ['Data fixa', 'Fecha fija'],
  'holidays.rules.easter': ['Móvel (relativo à Páscoa)', 'Móvil (relativo a la Pascua)'],
  'holidays.rules.month': ['Mês {month}', 'Mes {month}'],
  'holidays.rules.day': ['Dia', 'Día'],
  'holidays.rules.easterOffset': ['Dias após a Páscoa', 'Días después de la Pascua'],
  'holidays.rules.describeFixed': [
    'Todos os anos: {day}/{month}',
    'Todos los años: {day}/{month}',
  ],
  'holidays.rules.describeEaster': ['Páscoa {offset} dias', 'Pascua {offset} días'],
  'holidays.rules.createFailed': ['Falha ao criar regra.', 'Error al crear la regla.'],
  'holidays.rules.deleteFailed': ['Falha ao eliminar regra.', 'Error al eliminar la regla.'],
} as const satisfies Dictionary;
