import type { ParsedImportRow } from '../../lib/spreadsheet';
import { Badge, Button, Modal } from '../ui';

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
    <Modal
      title={title}
      size="lg"
      onClose={onClose}
      description={
        <>
          {validCount} linha{validCount === 1 ? '' : 's'} válida{validCount === 1 ? '' : 's'}
          {errorCount > 0 &&
            `, ${errorCount} com erro (não ${errorCount === 1 ? 'será' : 'serão'} importada${errorCount === 1 ? '' : 's'})`}
          .
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={importing || validCount === 0}>
            {importing ? 'A importar…' : `Importar ${validCount}`}
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="pm-table">
          <thead className="sticky top-0">
            <tr>
              <th>Linha</th>
              <th>Resumo</th>
              <th>Estado</th>
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
