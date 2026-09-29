import { formatDocumentDateTime, useDocumentActions } from '../documents';
import { useLang, useT } from '../../i18n';
import type { SignedDocument } from '../../types';

export interface LetterDocument {
  document: SignedDocument;
  /** Arquivado no hospital mas sem via: chegou sem forma de saber de qual das cartas é
   *  (ver "Documentos por associar"). Aparece na linha, marcado, para não ficar invisível. */
  withoutTrack: boolean;
}

// Célula "Cartas assinadas" da tabela de Aprovações: um par ver/descarregar por PDF
// recebido, com a data de chegada — é a data que distingue duas versões da mesma carta
// (os ficheiros têm quase sempre o mesmo nome). Mais recente primeiro.
export function SignedLetterLinks({ documents }: { documents: LetterDocument[] }) {
  const t = useT();
  const lang = useLang();
  const { open, busyId } = useDocumentActions();

  if (documents.length === 0) return <span className="text-gray-300">—</span>;

  return (
    <div className="flex flex-col gap-0.5">
      {documents.map(({ document, withoutTrack }) => {
        const busy = busyId === document.id;
        const received = formatDocumentDateTime(document.received_at, lang);
        return (
          <div key={document.id} className="flex items-center gap-1 whitespace-nowrap text-xs">
            <button
              type="button"
              className="text-brand-700 hover:underline disabled:opacity-50"
              onClick={() => open(document, false)}
              disabled={busy}
              title={t('approvals.letterDocs.viewTitle', { filename: document.filename })}
            >
              📄 {received}
            </button>
            <button
              type="button"
              className="rounded px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
              onClick={() => open(document, true)}
              disabled={busy}
              title={t('common.download')}
              aria-label={t('common.download')}
            >
              ⬇
            </button>
            {withoutTrack && (
              <span className="text-amber-600" title={t('approvals.letterDocs.withoutTrackTitle')}>
                {t('approvals.letterDocs.withoutTrack')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
