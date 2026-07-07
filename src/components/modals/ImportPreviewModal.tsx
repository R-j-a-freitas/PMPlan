import type { ParsedImportRow } from '../../lib/spreadsheet';
import { Button } from '../ui';

interface ImportPreviewModalProps<T> {
  title: string;
  rows: ParsedImportRow<T>[];
  renderPreview: (data: T) => string;
  importing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// Pré-visualização genérica antes de gravar — reutilizada por Equipamentos, Engenheiros e
// Hospitais. Mostra estado linha-a-linha (válida/erro) antes de qualquer escrita na BD;
// só as linhas válidas (data !== null) entram no botão de confirmação.
export function ImportPreviewModal<T>({
  title,
  rows,
  renderPreview,
  importing,
  onConfirm,
  onClose,
}: ImportPreviewModalProps<T>) {
  const validCount = rows.filter((row) => row.data !== null).length;
  const errorCount = rows.length - validCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white p-4 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-gray-900">{title}</h2>
        <p className="mb-3 text-sm text-gray-500">
          {validCount} linha{validCount === 1 ? '' : 's'} válida{validCount === 1 ? '' : 's'}
          {errorCount > 0 && `, ${errorCount} com erro (não ${errorCount === 1 ? 'será' : 'serão'} importada${errorCount === 1 ? '' : 's'})`}.
        </p>

        <div className="mb-4 flex-1 overflow-y-auto rounded-md border border-gray-200">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-2 py-1.5">Linha</th>
                <th className="px-2 py-1.5">Resumo</th>
                <th className="px-2 py-1.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rowNumber} className="border-b border-gray-100">
                  <td className="px-2 py-1 text-gray-500">{row.rowNumber}</td>
                  <td className="px-2 py-1">{row.data ? renderPreview(row.data) : (row.raw['Nome'] ?? '—')}</td>
                  <td className="px-2 py-1">
                    {row.error ? (
                      <span className="text-red-600">{row.error}</span>
                    ) : (
                      <span className="text-green-600">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={importing || validCount === 0}>
            {importing ? 'A importar…' : `Importar ${validCount}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
