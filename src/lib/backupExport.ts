import type { BackupExport } from '../types';

/** O que vai realmente para dentro do ficheiro descarregado. O `data` é o que a RPC
 *  devolveu; à volta dele vai o mínimo para que, daqui a dois anos, quem abrir o ficheiro
 *  perceba o que tem em mãos sem ter de adivinhar — incluindo o que NÃO tem. */
export interface BackupFileContents {
  app: 'PMPlan';
  /** Versão do formato deste ficheiro, não da aplicação. Sobe se a forma mudar. */
  format_version: 1;
  kind: 'exportacao-manual-json';
  exported_at: string;
  /** Em texto simples, porque é a primeira coisa que se lê ao abrir o ficheiro numa
   *  emergência — e a altura errada para descobrir que faltava metade. */
  aviso: string;
  data: BackupExport;
}

const AVISO =
  'Exportação manual dos dados do PMPlan, feita a partir do ecrã "Saúde do sistema". ' +
  'Contém as linhas de todas as tabelas do schema public e a lista de contas (id e email). ' +
  'NÃO contém schema, índices, políticas de RLS, funções, Edge Functions nem palavras-passe, ' +
  'e por isso não substitui o backup pg_dump da VPS (DOCS/DISASTER_RECOVERY.md). ' +
  'Restaurar a partir daqui exige uma base de dados com o schema já criado pelas migrações.';

/** `pmplan-dados-2026-08-13-1017.json` — data e hora locais, para vários ficheiros do
 *  mesmo dia não se sobreporem na pasta de transferências. */
export function backupFilename(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `pmplan-dados-${stamp}.json`;
}

export function buildBackupFile(data: BackupExport, now: Date = new Date()): BackupFileContents {
  return {
    app: 'PMPlan',
    format_version: 1,
    kind: 'exportacao-manual-json',
    exported_at: now.toISOString(),
    aviso: AVISO,
    data,
  };
}

/** Grava o ficheiro e devolve a dimensão real em bytes — que é o que fica registado em
 *  system_backups. Contar `content.length` daria caracteres, não bytes: os nomes de
 *  hospitais e equipamentos têm acentos, e cada um deles são dois bytes em UTF-8. */
export function downloadBackupFile(filename: string, contents: BackupFileContents): number {
  // Indentado a 2: um ficheiro de recuperação é para ser lido por uma pessoa em pânico,
  // e o custo em bytes de um JSON legível não paga a diferença.
  const blob = new Blob([JSON.stringify(contents, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return blob.size;
}
