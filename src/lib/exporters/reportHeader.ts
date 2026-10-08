import type { PMReportRow } from './reportRow';

// Partes comuns ao cabeçalho dos relatórios em PDF e Excel: o logótipo do PMPlan, as cores
// da marca e o texto do título (já traduzido por quem exporta).

/** Cores do logótipo: o "PM" (escuro), o "Plan" (claro) e os pontos (acento). */
export const BRAND_DARK = '#12505F';
export const BRAND_LIGHT = '#9AD8D7';
export const BRAND_ACCENT = '#3BAFC0';

/** O que vai no cabeçalho e nas colunas — tudo já no idioma de quem exporta. */
export interface ReportMeta {
  /** Ex.: "Relatório de Manutenções Preventivas". */
  title: string;
  /** Ex.: "Ano 2026 · 29 PMs". */
  subtitle: string;
  /** Ex.: "Modalidade: Flexitron · Hospital: Todos · Engenheiro: Alejandro Blat". */
  filters: string;
  /** Ex.: "Gerado em 08/10/2026 15:42 por Ricardo Freitas". */
  generated: string;
  /** Rótulo da coluna por campo. */
  columns: Record<keyof PMReportRow, string>;
  /** Estado da PM traduzido ("completed" → "Concluída"). */
  statusLabel: (status: string) => string;
  /** Texto do rodapé do PDF: "Página {page} de {total}". */
  pageLabel: (page: number, total: number) => string;
}

export interface ReportLogo {
  dataUrl: string;
  /** Proporção largura/altura do logótipo já recortado. */
  ratio: number;
}

// O ficheiro public/pmplan-logo.png tem 2848×1498 px com muita margem branca à volta das
// letras. Recorta-se à área das letras e reduz-se a 600 px de largura: no PDF ocupa ~35 mm
// e o original (≈180 KB) ia inteiro para dentro de cada relatório.
const CROP = { left: 0.045, top: 0.32, right: 0.96, bottom: 0.685 };
const TARGET_WIDTH = 600;

let cached: Promise<ReportLogo | null> | null = null;

/** Logótipo pronto a embeber; null se não carregar (o relatório sai na mesma, sem ele). */
export function loadReportLogo(): Promise<ReportLogo | null> {
  cached ??= new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const sx = image.naturalWidth * CROP.left;
      const sy = image.naturalHeight * CROP.top;
      const sw = image.naturalWidth * (CROP.right - CROP.left);
      const sh = image.naturalHeight * (CROP.bottom - CROP.top);
      const canvas = document.createElement('canvas');
      canvas.width = TARGET_WIDTH;
      canvas.height = Math.round((TARGET_WIDTH * sh) / sw);
      const context = canvas.getContext('2d');
      if (!context) return resolve(null);
      context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve({ dataUrl: canvas.toDataURL('image/png'), ratio: sw / sh });
    };
    image.onerror = () => resolve(null);
    image.src = '/pmplan-logo.png';
  });
  return cached;
}

/** Descarrega um Blob com o nome dado (o ExcelJS devolve o ficheiro, não o guarda). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
