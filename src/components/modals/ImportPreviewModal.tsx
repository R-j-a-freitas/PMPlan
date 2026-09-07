import { useMemo, useState } from 'react';
import type { ParsedImportRow, RefKind } from '../../lib/spreadsheet';
import type { ImportAliases } from '../../lib/importers/importHelpers';
import { aliasKey } from '../../lib/importers/importHelpers';
import { Badge, Button, Modal, SegmentedGroup, SegmentedOption } from '../ui';
import { useT, type TranslationKey } from '../../i18n';

/** Registo existente que pode ser escolhido como correspondência. */
export interface RefOption {
  id: string;
  name: string;
}

const REF_NOUN_KEYS: Record<RefKind, TranslationKey> = {
  zone: 'import.ref.zone',
  hospital: 'import.ref.hospital',
  engineer: 'import.ref.engineer',
};

/** Uma correspondência: um valor do ficheiro, todas as colunas e linhas onde aparece, e o
 *  registo a que vai ficar ligado. */
interface RefMatch {
  key: string;
  kind: RefKind;
  value: string;
  columns: string[];
  rowCount: number;
  resolvedId: string | null;
}

interface ImportPreviewModalProps<T> {
  title: string;
  rows: ParsedImportRow<T>[];
  renderPreview: (data: T) => string;
  importing: boolean;
  /** Registos existentes por tipo, para as correspondências à mão. Sem isto o modal
   *  comporta-se como antes (só mostra os erros). */
  refOptions?: Partial<Record<RefKind, RefOption[]>>;
  aliases?: ImportAliases;
  onAliasChange?: (key: string, recordId: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

// Pré-visualização genérica antes de gravar — reutilizada por Equipamentos, Engenheiros e
// Hospitais. Mostra estado linha-a-linha (válida/erro) antes de qualquer escrita na BD;
// só as linhas válidas (data !== null) entram no botão de confirmação.
//
// O painel de cima lista as ligações a outros registos que o ficheiro faz pelo nome
// (zona, hospital, engenheiro) e deixa trocar cada uma. A escolha é por VALOR e não por
// linha: um ficheiro de outro sistema traz o mesmo nome repetido dezenas de vezes, e
// resolvê-lo linha a linha seria trabalho a dobrar. O ficheiro não é alterado — o mapa
// vive só nesta janela.
export function ImportPreviewModal<T>({
  title,
  rows,
  renderPreview,
  importing,
  refOptions,
  aliases = {},
  onAliasChange,
  onConfirm,
  onClose,
}: ImportPreviewModalProps<T>) {
  const t = useT();
  const validCount = rows.filter((row) => row.data !== null).length;
  const errorCount = rows.length - validCount;

  // Agrega as referências de todas as linhas por valor. Como os parsers reportam também
  // as que casaram, uma referência resolvida não desaparece da lista — continua visível
  // (e trocável) depois de escolhida.
  const matches = useMemo(() => {
    const byKey = new Map<string, RefMatch>();
    for (const row of rows) {
      for (const ref of row.refs) {
        if (!refOptions?.[ref.kind]?.length) continue;
        const key = aliasKey(ref.kind, ref.value);
        const entry = byKey.get(key);
        if (!entry) {
          byKey.set(key, {
            key,
            kind: ref.kind,
            value: ref.value,
            columns: [ref.column],
            rowCount: 1,
            resolvedId: ref.resolvedId,
          });
          continue;
        }
        entry.rowCount += 1;
        if (!entry.columns.includes(ref.column)) entry.columns.push(ref.column);
      }
    }
    return [...byKey.values()].sort((a, b) => a.value.localeCompare(b.value, 'pt'));
  }, [rows, refOptions]);

  const pending = useMemo(() => matches.filter((match) => !match.resolvedId), [matches]);
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  // Resolvida a última pendente, o separador vazio deixaria o painel em branco.
  const activeTab = tab === 'pending' && pending.length === 0 ? 'all' : tab;
  const shown = activeTab === 'pending' ? pending : matches;

  return (
    <Modal
      title={title}
      size="lg"
      onClose={onClose}
      description={
        <>
          {t('import.validRows', { count: validCount })}
          {errorCount > 0 && t('import.errorRows', { count: errorCount })}.
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={importing || validCount === 0}>
            {importing ? t('import.importing') : t('import.confirm', { count: validCount })}
          </Button>
        </>
      }
    >
      {matches.length > 0 && (
        <div
          className={`mb-4 rounded-lg border p-3 ${
            pending.length > 0 ? 'border-amber-200 bg-amber-50/70' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-sm font-medium ${pending.length > 0 ? 'text-amber-900' : 'text-gray-700'}`}>
              {t('import.matches')}
            </p>
            <SegmentedGroup>
              <SegmentedOption active={activeTab === 'pending'} onClick={() => setTab('pending')}>
                {t('import.needsAttention', { count: pending.length })}
              </SegmentedOption>
              <SegmentedOption active={activeTab === 'all'} onClick={() => setTab('all')}>
                {t('import.allMatches', { count: matches.length })}
              </SegmentedOption>
            </SegmentedGroup>
          </div>
          <p className={`mt-1 text-xs ${pending.length > 0 ? 'text-amber-800' : 'text-gray-500'}`}>
            {activeTab === 'pending' ? t('import.pendingHelp') : t('import.allHelp')}
          </p>

          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {shown.map((match) => (
              <li key={match.key} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-sm text-gray-700">
                  <span className="text-gray-500">{match.columns.join(', ')}:</span>{' '}
                  <span className="font-medium">{match.value || t('import.emptyValue')}</span>{' '}
                  <span className="text-xs text-gray-500">{t('import.rowsUsing', { count: match.rowCount })}</span>{' '}
                  {aliases[match.key] && <Badge tone="brand">{t('import.manual')}</Badge>}
                  {!match.resolvedId && <Badge tone="warning">{t('import.unresolved')}</Badge>}
                </span>
                <select
                  className="pm-field w-64"
                  value={match.resolvedId ?? ''}
                  onChange={(event) => onAliasChange?.(match.key, event.target.value)}
                  aria-label={t('import.matchAria', { column: match.columns[0] ?? '', value: match.value })}
                >
                  <option value="">{t('import.chooseRef', { noun: t(REF_NOUN_KEYS[match.kind]) })}</option>
                  {(refOptions?.[match.kind] ?? []).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="pm-table">
          <thead className="sticky top-0">
            <tr>
              <th>{t('import.col.row')}</th>
              <th>{t('import.col.summary')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowNumber}>
                <td className="tabular-nums text-gray-500">{row.rowNumber}</td>
                <td>{row.data ? renderPreview(row.data) : (row.raw['Nome'] ?? '—')}</td>
                <td>
                  {row.error ? (
                    <span className="text-sm text-red-600">{row.error}</span>
                  ) : (
                    <Badge tone="success">OK</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
