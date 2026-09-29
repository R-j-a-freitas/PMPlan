import { Badge, Button, Card, EmptyState } from '../ui';
import { formatDocumentDateTime, MatchBadge, useDocumentActions } from '../documents';
import { APPROVAL_TRACK_COLORS } from '../../lib/approvalTrack';
import { APPROVAL_TRACK_KEYS } from '../../i18n/labels';
import { useLang, useT } from '../../i18n';
import type { ApprovalTrack, SignedDocument } from '../../types';

export interface ApprovalSignedDocumentRow {
  document: SignedDocument;
  hospitalName: string;
  track: ApprovalTrack;
}

// Cartas assinadas devolvidas pelos clientes, no mesmo ecrã onde se acompanha o processo.
// São os mesmos documentos da ficha do hospital (signed_documents) — aqui filtrados às
// propostas do ano de planeamento e com a via, que é o que interessa a quem está a fechar
// o workflow. Chegam sozinhos pelo webhook; esta tabela actualiza-se em tempo real.
export function ApprovalSignedDocuments({ rows }: { rows: ApprovalSignedDocumentRow[] }) {
  const t = useT();
  const lang = useLang();
  const { open, busyId } = useDocumentActions();

  return (
    <Card
      padded={false}
      className="mt-4"
      title={t('approvals.signedDocs.title', { count: rows.length })}
      subtitle={t('approvals.signedDocs.subtitle')}
    >
      {rows.length === 0 ? (
        <EmptyState>{t('approvals.signedDocs.empty')}</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="pm-table">
            <thead>
              <tr>
                <th className="py-1.5 pr-2">{t('common.hospital')}</th>
                <th className="py-1.5 pr-2">{t('approvals.col.track')}</th>
                <th className="py-1.5 pr-2">{t('approvals.signedDocs.col.file')}</th>
                <th className="py-1.5 pr-2">{t('approvals.signedDocs.col.receivedAt')}</th>
                <th className="py-1.5 pr-2">{t('approvals.signedDocs.col.from')}</th>
                <th className="py-1.5 pr-2">{t('approvals.signedDocs.col.match')}</th>
                <th className="py-1.5 pr-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ document, hospitalName, track }) => {
                const busy = busyId === document.id;
                return (
                  <tr key={document.id}>
                    <td className="py-1.5 pr-2">{hospitalName}</td>
                    <td className="py-1.5 pr-2">
                      <Badge color={APPROVAL_TRACK_COLORS[track]}>{t(APPROVAL_TRACK_KEYS[track])}</Badge>
                    </td>
                    <td className="max-w-xs truncate py-1.5 pr-2" title={document.filename}>
                      {document.filename}
                    </td>
                    <td className="py-1.5 pr-2" title={document.subject ?? ''}>
                      {formatDocumentDateTime(document.received_at, lang)}
                    </td>
                    <td className="py-1.5 pr-2" title={document.from_email ?? ''}>
                      {document.from_name ?? document.from_email ?? '—'}
                    </td>
                    <td className="py-1.5 pr-2">
                      <MatchBadge method={document.match_method} />
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => open(document, false)} disabled={busy}>
                          {t('common.view')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => open(document, true)} disabled={busy}>
                          {t('common.download')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
