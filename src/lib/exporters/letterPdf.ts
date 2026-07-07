import { jsPDF } from 'jspdf';
import { eachDayOfInterval } from 'date-fns';
import type { Country, EquipmentFull, PMEvent } from '../../types';

export interface LetterEquipmentGroup {
  serialNumber: string;
  taskLabel: string;
  /** Uma entrada por dia (não por intervalo) — mesma convenção das cartas de referência
   *  (DOCS/), que listam cada dia de uma intervenção em linhas separadas. */
  dates: string[];
}

export interface ProposalLetterData {
  hospitalName: string;
  country: Country;
  year: number;
  equipmentGroups: LetterEquipmentGroup[];
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateDDMMYYYY(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// "Mantenimiento acelerador" / "Manutenção acelerador" — texto da TAREA nas cartas de
// referência para LINAC; outras modalidades usam o próprio nome da modalidade.
function taskLabel(modality: string, country: Country): string {
  const verb = country === 'ES' ? 'Mantenimiento' : 'Manutenção';
  const noun = modality.toLowerCase() === 'linac' ? 'acelerador' : modality;
  return `${verb} ${noun}`;
}

// Agrupa as PMs (activas, não canceladas) de cada equipamento do hospital, expandindo
// cada intervalo [start_date, end_date] em datas individuais (uma linha por dia, ver
// LetterEquipmentGroup). Equipamentos sem nenhuma PM no ano ficam de fora.
export function buildProposalLetterData(
  hospitalName: string,
  country: Country,
  year: number,
  equipmentList: EquipmentFull[],
  pmEvents: PMEvent[],
): ProposalLetterData {
  const equipmentGroups = equipmentList
    .map((equipment): LetterEquipmentGroup => {
      const dates = pmEvents
        .filter((event) => event.equipment_id === equipment.id && event.status !== 'cancelled')
        .flatMap((event) => eachDayOfInterval({ start: new Date(event.start_date), end: new Date(event.end_date) }))
        .sort((a, b) => a.getTime() - b.getTime())
        .map(formatDateDDMMYYYY);
      return {
        serialNumber: equipment.serial_number ?? equipment.name,
        taskLabel: taskLabel(equipment.modality, country),
        dates,
      };
    })
    .filter((group) => group.dates.length > 0);

  return { hospitalName, country, year, equipmentGroups };
}

async function loadImageAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao carregar o logótipo.'));
    reader.readAsDataURL(blob);
  });
}

// Textos fixos das cartas de referência (DOCS/HOSP. DO MEIXOEIRO - RADIO (1).pdf e
// DOCS/HOSP. DE BRAGA - RADIO (1).pdf) — mesma entidade/morada/rodapé legal para PT e ES
// (Elekta Medical, S.A., Madrid); só o texto do corpo e quem assina varia por país.
const COPY = {
  ES: {
    months: [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ],
    dateCity: 'Madrid',
    subject: (year: number) => `Plan de Mantenimiento Preventivo ${year}`,
    greeting: 'Muy Sres nuestros,',
    intro: (year: number) =>
      `De acuerdo con el programa de mantenimiento recomendado, a continuación, les informamos de las fechas propuestas para la realización de los Mantenimientos Preventivos durante el Año de ${year}:`,
    columns: { hospital: 'HOSPITAL', serial: 'N/S', task: 'TAREA', dates: 'FECHAS' },
    closing: [
      'Rogamos que en las fechas indicadas dejen el sistema a disposición de nuestros ingenieros a fin de poder realizar las revisiones.',
      'La realización de dichas intervenciones queda condicionada a la existencia de un contrato de mantenimiento en la fecha de intervención.',
      'Les agradeceríamos nos devolvieran la copia firmada con su aceptación por correo electrónico (spainsupport@elekta.com / teresa.matos@elekta.com).',
    ],
    farewell: 'Aprovechamos la ocasión para saludarles atentamente,',
    acceptanceHeading: 'CONFORME Y ACEPTADO:',
    signLabel: 'Firmado:',
    nameLabel: 'Nombre:',
    dateLabel: 'Fecha:',
    senderLines: ['Teresa Matos', 'ELEKTA MEDICAL', 'Coordinación de Servicio Técnico'],
  },
  PT: {
    months: [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ],
    dateCity: 'Madrid',
    subject: (year: number) => `Plano de Manutenções Preventivas ${year}`,
    greeting: 'Exmos Srs,',
    intro: (year: number) =>
      `De acordo com o programa de manutenção previsto para os vossos equipamentos, enviamos neste documento a proposta de datas para a realização das Manutenções Preventivas durante o ano de ${year}.`,
    columns: { hospital: 'HOSPITAL', serial: 'N/S', task: 'TAREA', dates: 'FECHAS' },
    closing: [
      'No seguimento deste plano solicitamos que coloquem o equipamento à disposição dos nossos engenheiros por forma a viabilizar as referidas manutenções. As tarefas do Programa de Manutenções a realizar podem ser modificadas devido a obsolescências técnicas que apresentem os equipamentos. Caso as mesmas se verifiquem, serão atempadamente comunicadas.',
      'A realização das intervenções acima listadas está condicionada à existência de um Contrato de Manutenção vigente à data de cada intervenção.',
      'Agradecemos a devolução de uma cópia desta carta devidamente assinada como prova de aceitação da calendarização para o email teresa.matos@elekta.com ou então via fax para o número +34 915 973 519. Caso necessite de alguma alteração/modificação pode entrar em contacto connosco via email teresa.matos@elekta.com ou alternativamente através do número de telefone 21 1349530.',
    ],
    farewell: 'Agradecemos desde já a vossa colaboração.\nCom os melhores cumprimentos,',
    acceptanceHeading: 'CONFIRMO E ACEITO:',
    signLabel: null,
    nameLabel: 'Nome:',
    dateLabel: 'Data:',
    senderLines: ['Teresa Matos / Susana Nunes', 'RRTS Unipessoal Lda', 'Coordenação Serviço Técnico'],
  },
} as const;

const LEGAL_FOOTER =
  'ELEKTA MEDICAL, S.A.  Manuel Tovar, 43 - 28034 Madrid  Tel: +34 91 556 20 25  Fax +34 91 597 35 19';
const LEGAL_FOOTER_2 =
  'Registro Mercantil de Madrid. Tomo 12.720. Libro 0. Folio 39. Sección 8. Hoja M-203783. Inscripción 16. C.I.F.: A - 81886731';

const PAGE_MARGIN = 20;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_BOTTOM = PAGE_HEIGHT - 28; // deixa espaço para o rodapé legal + nº de página
const LOGO_WIDTH = 38;
const LOGO_HEIGHT = 10.3; // proporção do ficheiro public/elekta-logo.png (já recortado)

function formatLetterDate(date: Date, country: Country): string {
  const copy = COPY[country];
  return `${copy.dateCity}, ${date.getDate()} de ${copy.months[date.getMonth()]} de ${date.getFullYear()}`;
}

// Gera o PDF da carta de aprovação/assinatura (variante PT/ES) com o mesmo formato das
// cartas de referência: logótipo, assunto, tabela (agrupada por equipamento, com
// subcabeçalho por nº de série quando há mais que um), parágrafos de fecho e bloco de
// assinatura. Devolve o jsPDF pronto para `.save()`, `.output('datauristring')`, etc.
export async function generateProposalLetterPdf(data: ProposalLetterData): Promise<jsPDF> {
  const copy = COPY[data.country];
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await loadImageAsDataUrl('/elekta-logo.png');
  } catch {
    logoDataUrl = null;
  }

  let y = PAGE_MARGIN;

  // Nº de página fica de fora daqui de propósito — só se sabe o total no fim, é
  // preenchido numa segunda passagem depois de todo o conteúdo estar desenhado.
  function drawFooter() {
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(LEGAL_FOOTER, PAGE_WIDTH / 2, PAGE_HEIGHT - 14, { align: 'center' });
    doc.text(LEGAL_FOOTER_2, PAGE_WIDTH / 2, PAGE_HEIGHT - 10, { align: 'center' });
    doc.setTextColor(0);
  }

  function newPage() {
    drawFooter();
    doc.addPage();
    y = PAGE_MARGIN;
    if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', PAGE_MARGIN, y, LOGO_WIDTH, LOGO_HEIGHT);
    y += LOGO_HEIGHT + 12;
  }

  function ensureSpace(neededHeight: number) {
    if (y + neededHeight > CONTENT_BOTTOM) newPage();
  }

  function paragraph(text: string, options: { bold?: boolean; gap?: number } = {}) {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, PAGE_WIDTH - PAGE_MARGIN * 2) as string[];
    ensureSpace(lines.length * 5 + (options.gap ?? 5));
    doc.text(lines, PAGE_MARGIN, y);
    y += lines.length * 5 + (options.gap ?? 5);
  }

  // ─── Cabeçalho ───
  if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', PAGE_MARGIN, y, LOGO_WIDTH, LOGO_HEIGHT);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(formatLetterDate(new Date(), data.country), PAGE_WIDTH - PAGE_MARGIN, y + 6, { align: 'right' });
  y += LOGO_HEIGHT + 12;

  paragraph(`Asunto: ${copy.subject(data.year)}`, { bold: true, gap: 6 });
  paragraph(copy.greeting, { gap: 6 });
  paragraph(copy.intro(data.year), { gap: 6 });

  // ─── Tabela ───
  const columns = [
    { label: copy.columns.hospital, width: 55 },
    { label: copy.columns.serial, width: 25 },
    { label: copy.columns.task, width: 60 },
    { label: copy.columns.dates, width: 30 },
  ];
  const tableWidth = columns.reduce((total, column) => total + column.width, 0);
  const rowHeight = 6;

  // doc.text() não corta pela largura da célula — escreve a string inteira e, se for
  // mais larga que a coluna, transborda visualmente para a coluna seguinte (ex: nome de
  // hospital comprido a sobrepor-se ao Nº de Série). Mede com a fonte/tamanho já activos
  // e corta carácter a carácter até caber, com reticências no fim.
  function truncateToWidth(text: string, maxWidth: number): string {
    if (doc.getTextWidth(text) <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 0 && doc.getTextWidth(`${truncated}…`) > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return `${truncated}…`;
  }

  function tableHeader() {
    ensureSpace(rowHeight + 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    let x = PAGE_MARGIN;
    doc.rect(PAGE_MARGIN, y, tableWidth, rowHeight);
    for (const column of columns) {
      doc.text(truncateToWidth(column.label, column.width - 4), x + 2, y + rowHeight - 2);
      if (x > PAGE_MARGIN) doc.line(x, y, x, y + rowHeight);
      x += column.width;
    }
    y += rowHeight;
  }

  function tableRow(cells: string[], bold = false) {
    ensureSpace(rowHeight);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    let x = PAGE_MARGIN;
    doc.rect(PAGE_MARGIN, y, tableWidth, rowHeight);
    columns.forEach((column, i) => {
      const cell = cells[i];
      if (cell) doc.text(truncateToWidth(cell, column.width - 4), x + 2, y + rowHeight - 2);
      if (x > PAGE_MARGIN) doc.line(x, y, x, y + rowHeight);
      x += column.width;
    });
    y += rowHeight;
  }

  tableHeader();
  const multipleEquipment = data.equipmentGroups.length > 1;
  for (const group of data.equipmentGroups) {
    if (multipleEquipment) tableRow([group.serialNumber, '', '', ''], true);
    for (const date of group.dates) {
      tableRow([data.hospitalName, group.serialNumber, group.taskLabel, date]);
    }
  }
  y += 8;

  // ─── Fecho + assinatura ───
  for (const text of copy.closing) paragraph(text, { gap: 5 });
  const farewellLines = copy.farewell.split('\n');
  farewellLines.forEach((line, index) => {
    paragraph(line, { gap: index === farewellLines.length - 1 ? 10 : 1 });
  });

  paragraph(copy.acceptanceHeading, { bold: true, gap: 10 });
  if (copy.signLabel) {
    paragraph(`${copy.signLabel} ${'_'.repeat(70)}`, { gap: 10 });
    paragraph(`${copy.nameLabel} ${'_'.repeat(50)}`, { gap: 8 });
    paragraph(`${copy.dateLabel} ${'_'.repeat(30)}`, { gap: 10 });
  } else {
    ensureSpace(10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`${copy.nameLabel} ${'_'.repeat(45)}`, PAGE_MARGIN, y);
    doc.text(`${copy.dateLabel} ____________`, PAGE_WIDTH - PAGE_MARGIN - 35, y);
    y += 10;
    paragraph('Assinatura', { gap: 10 });
  }

  y += 6;
  for (const line of copy.senderLines) paragraph(line, { gap: 1 });

  drawFooter();
  // Corrige o total de páginas em todos os rodapés já desenhados (só se sabe no fim).
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`Pág.: ${page} / ${totalPages}`, PAGE_WIDTH - PAGE_MARGIN, PAGE_HEIGHT - 18, { align: 'right' });
    doc.setTextColor(0);
  }

  return doc;
}
