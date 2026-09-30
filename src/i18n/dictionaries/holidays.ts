import type { Dictionary } from '../types';

// Página de feriados: as cinco categorias por âmbito e as regras recorrentes.
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
  'holidays.source.rule': ['Regra', 'Regla'],
  'holidays.source.boe': ['BOE', 'BOE'],

  // ─── Nota do topo: origem dos dados e como confirmar ─────────────────────────
  'holidays.note.title': [
    'De onde vêm os feriados de {year}, onde confirmar e o que tem de ser feito à mão',
    'De dónde vienen los festivos de {year}, dónde confirmarlos y qué hay que hacer a mano',
  ],
  'holidays.note.auto': ['automático', 'automático'],
  'holidays.note.rules': ['regras na app', 'reglas en la app'],
  'holidays.note.manual': ['revisão manual anual', 'revisión manual anual'],
  'holidays.note.confirm': ['Confirmar:', 'Confirmar:'],
  'holidays.note.national.title': ['Nacionais de Portugal e Espanha', 'Nacionales de Portugal y España'],
  'holidays.note.national.body': [
    'Vêm da API pública Nager.Date na primeira vez que alguém abre o ano (aqui ou no calendário) e ficam gravados na base de dados.',
    'Vienen de la API pública Nager.Date la primera vez que alguien abre el año (aquí o en el calendario) y quedan guardados en la base de datos.',
  ],
  'holidays.note.national.ptLaw': ['Feriados em Portugal (lista e lei)', 'Festivos en Portugal (lista y ley)'],
  'holidays.note.regional.title': [
    'Regionais de Espanha (Comunidades Autónomas)',
    'Regionales de España (Comunidades Autónomas)',
  ],
  'holidays.note.regional.body': [
    'Vêm do BOE: a resolução anual "relación de fiestas laborales", publicada no fim de Outubro do ano anterior. Um processo no servidor procura-a todas as segundas-feiras e importa-a sozinho; até lá ficam os da Nager.Date, que podem ter erros.',
    'Vienen del BOE: la resolución anual "relación de fiestas laborales", publicada a finales de octubre del año anterior. Un proceso en el servidor la busca todos los lunes y la importa solo; hasta entonces quedan los de Nager.Date, que pueden tener errores.',
  ],
  'holidays.note.regional.imported': [
    'Estado de {year}: importado do BOE ({boeId}) em {date}.',
    'Estado de {year}: importado del BOE ({boeId}) el {date}.',
  ],
  'holidays.note.regional.pending': [
    'Estado de {year}: ainda não importado do BOE — os regionais mostrados são provisórios (Nager.Date).',
    'Estado de {year}: aún no importado del BOE — los regionales mostrados son provisionales (Nager.Date).',
  ],
  'holidays.note.regional.resolution': ['resolução {boeId} no BOE', 'resolución {boeId} en el BOE'],
  'holidays.note.regional.search': [
    'pesquisar no BOE "fiestas laborales para el año {year}"',
    'buscar en el BOE "fiestas laborales para el año {year}"',
  ],
  'holidays.note.localPT.title': ['Locais de Portugal (concelhos)', 'Locales de Portugal (municipios)'],
  'holidays.note.localPT.body': [
    'Regras gravadas na app, uma por concelho (os 308 estão carregados): a mesma data todos os anos, ou relativa à Páscoa. Raramente mudam. Aparecem só os concelhos com equipamento.',
    'Reglas guardadas en la app, una por municipio (los 308 están cargados): la misma fecha todos los años, o relativa a la Pascua. Rara vez cambian. Solo aparecen los municipios con equipos.',
  ],
  'holidays.note.localPT.link': ['feriados municipais de todos os concelhos', 'festivos municipales de todos los municipios'],
  'holidays.note.localES.title': ['Locais de Espanha (fiestas locales das cidades)', 'Locales de España (fiestas locales de las ciudades)'],
  'holidays.note.localES.body': [
    'Cada câmara fixa as suas duas fiestas locales todos os anos, publicadas no boletim da província entre Outubro e Dezembro. Não há uma fonte única para as importar, por isso revêem-se aqui uma vez por ano:',
    'Cada ayuntamiento fija sus dos fiestas locales cada año, publicadas en el boletín provincial entre octubre y diciembre. No hay una fuente única para importarlas, así que se revisan aquí una vez al año:',
  ],
  'holidays.note.localES.step1': [
    'Quando: em Novembro/Dezembro, depois do email "Feriados de Espanha importados do BOE" (ou do aviso azul no cartão das regras de Espanha).',
    'Cuándo: en noviembre/diciembre, tras el email "Festivos de España importados del BOE" (o el aviso azul en la tarjeta de reglas de España).',
  ],
  'holidays.note.localES.step2': [
    'Escolha o ano novo no selector "Ano" desta página (agora: {year}). As edições valem a partir do ano escolhido.',
    'Elija el año nuevo en el selector "Año" de esta página (ahora: {year}). Las ediciones valen a partir del año elegido.',
  ],
  'holidays.note.localES.step3': [
    'Em "Regras dos Feriados Locais de Espanha", abra o link "Confirmar" de cada cidade e compare as datas. Catalunha tem calendário oficial próprio:',
    'En "Reglas de los Festivos Locales de España", abra el enlace "Confirmar" de cada ciudad y compare las fechas. Cataluña tiene calendario oficial propio:',
  ],
  'holidays.note.localES.step4': [
    'Se a data mudou, carregue em Editar: a nova data vale a partir de {year} e os anos anteriores não mudam. Se o feriado depende da Páscoa (Corpus, Lunes de San Vicente, Carnaval…), escolha "Móvel" e passa a acertar sozinho todos os anos.',
    'Si la fecha cambió, pulse Editar: la nueva fecha vale a partir de {year} y los años anteriores no cambian. Si el festivo depende de la Pascua (Corpus, Lunes de San Vicente, Carnaval…), elija "Móvil" y se ajustará solo cada año.',
  ],
  'holidays.note.localES.step5': [
    'Feriado que deixou de existir: Eliminar (também só a partir do ano escolhido). Feriado novo: Adicionar regra, com a cidade escrita exactamente como no hospital.',
    'Festivo que dejó de existir: Eliminar (también solo a partir del año elegido). Festivo nuevo: Añadir regla, con la ciudad escrita exactamente como en el hospital.',
  ],
  'holidays.note.localES.step6': [
    'Cidades no aviso amarelo "Sem feriados locais definidos" têm hospital mas nenhuma regra — acrescente-as.',
    'Las ciudades del aviso amarillo "Sin festivos locales definidos" tienen hospital pero ninguna regla — añádalas.',
  ],
  'holidays.note.localES.catalonia': ['calendari laboral da Generalitat', 'calendari laboral de la Generalitat'],
  'holidays.rules.confirm': ['Confirmar', 'Confirmar'],

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
  'holidays.regionalES.fromBoe': [
    'Fonte: BOE (importação automática).',
    'Fuente: BOE (importación automática).',
  ],
  'holidays.regionalES.fromNager': [
    'Fonte provisória: Nager.Date, que pode falhar — o BOE de {year} ainda não foi importado (sai no fim de Outubro do ano anterior e é importado automaticamente).',
    'Fuente provisional: Nager.Date, que puede fallar — el BOE de {year} aún no se ha importado (sale a finales de octubre del año anterior y se importa automáticamente).',
  ],
  'holidays.localES': ['Feriados Locais de Espanha', 'Festivos Locales de España'],
  'holidays.localESHint': [
    'Fiestas locales das cidades onde existem equipamentos instalados.',
    'Fiestas locales de las ciudades donde hay equipos instalados.',
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
  'holidays.rules.newES': ['Novo feriado local de Espanha', 'Nuevo festivo local de España'],
  'holidays.rules.editFrom': [
    'Editar regra — a partir de {year} (os anos anteriores não mudam)',
    'Editar regla — a partir de {year} (los años anteriores no cambian)',
  ],
  'holidays.rules.validFrom': ['desde {year}', 'desde {year}'],
  'holidays.rules.validUntil': ['até {year}', 'hasta {year}'],
  'holidays.rules.titleES': [
    'Regras dos Feriados Locais de Espanha (cidades)',
    'Reglas de los Festivos Locales de España (ciudades)',
  ],
  'holidays.rules.subtitleES': [
    'Cada câmara fixa as suas duas fiestas locales todos os anos: as datas aqui projectam-se para os anos seguintes e devem ser confirmadas e editadas quando sair o calendário do ano novo. A cidade tem de estar escrita como no hospital.',
    'Cada ayuntamiento fija sus dos fiestas locales cada año: las fechas de aquí se proyectan a los años siguientes y deben confirmarse y editarse cuando salga el calendario del nuevo año. La ciudad debe escribirse como en el hospital.',
  ],
  'holidays.rules.emptyES': [
    'Sem regras para cidades com equipamentos instalados.',
    'Sin reglas para ciudades con equipos instalados.',
  ],
  'holidays.rules.boeImported': [
    'Os feriados regionais de {year} foram importados do BOE ({boeId}) em {date}. As fiestas locales não vêm no BOE: confirme as datas de {year} de cada cidade (Editar).',
    'Los festivos regionales de {year} se importaron del BOE ({boeId}) el {date}. Las fiestas locales no vienen en el BOE: confirme las fechas de {year} de cada ciudad (Editar).',
  ],
  'holidays.rules.missing': [
    'Sem feriados locais definidos: {list}',
    'Sin festivos locales definidos: {list}',
  ],
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
  'holidays.rules.updateFailed': ['Falha ao guardar regra.', 'Error al guardar la regla.'],
  'holidays.rules.deleteFailed': ['Falha ao eliminar regra.', 'Error al eliminar la regla.'],
} as const satisfies Dictionary;
