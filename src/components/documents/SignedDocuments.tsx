import { useState } from 'react';
import { useAuthStore, useSignedDocumentStore, useUiStore } from '../../stores';
import { Link } from 'react-router-dom';
import type { SignedDocument, SignedDocumentMatchMethod } from '../../types';
import { Badge, Button } from '../ui';
import { useLang, useT, type TranslationKey } from '../../i18n';
import { formatDocumentDateTime, useDocumentActions } from './documentActions';

// Quão fiável foi a associação ao hospital. Um documento identificado pelo código da
// proposta é certo; um identificado pelo email do remetente é um palpite informado — e
// quem está a olhar para o arquivo tem de conseguir ver a diferença sem ir à BD.
const MATCH_META: Record<
  SignedDocumentMatchMethod,
  { labelKey: TranslationKey; color: string; titleKey: TranslationKey }
> = {
  reference_code: {
    labelKey: 'documents.match.reference_code',
    color: '#16A34A',
    titleKey: 'documents.match.reference_codeTitle',
  },
  subject_hospital: {
    labelKey: 'documents.match.subject_hospital',
    color: '#3B82F6',
    titleKey: 'documents.match.subject_hospitalTitle',
  },
  sender_email: {
    labelKey: 'documents.match.sender_email',
    color: '#F59E0B',
    titleKey: 'documents.match.sender_emailTitle',
  },
  manual: {
    labelKey: 'documents.match.manual',
    color: '#8B5CF6',
    titleKey: 'documents.match.manualTitle',
  },
  unmatched: {
    labelKey: 'documents.match.unmatched',
    color: '#DC2626',
    titleKey: 'documents.match.unmatchedTitle',
  },
};

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Etiqueta de como o documento foi associado — partilhada com a tabela da página de
 *  Aprovações. */
export function MatchBadge({ method }: { method: SignedDocumentMatchMethod }) {
  const t = useT();
  const match = MATCH_META[method];
  return (
    <span title={t(match.titleKey)}>
      <Badge color={match.color}>{t(match.labelKey)}</Badge>
    </span>
  );
}

interface DocumentRowProps {
  document: SignedDocument;
}

function DocumentRow({ document }: DocumentRowProps) {
  const t = useT();
  const lang = useLang();
  const { open, busyId } = useDocumentActions();
  const deleteSignedDocument = useSignedDocumentStore((state) => state.deleteSignedDocument);
  // Apagar é exclusivo do admin, a espelhar a policy de RLS (migração 0015) — a UI não é
  // a barreira, só evita mostrar um botão que a BD ia recusar.
  const role = useAuthStore((state) => state.profile?.role);
  const pushToast = useUiStore((state) => state.pushToast);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const busy = busyId === document.id;

  async function handleDelete() {
    try {
      await deleteSignedDocument(document.id);
      pushToast({ variant: 'success', message: t('documents.deleted') });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('documents.deleteFailed') });
    } finally {
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium" title={document.filename}>
        {document.filename}
      </span>
      <span className="shrink-0 text-xs text-gray-400">{formatSize(document.size_bytes)}</span>
      <span className="shrink-0 text-xs text-gray-500" title={document.subject ?? ''}>
        {formatDocumentDateTime(document.received_at, lang)}
      </span>
      {document.from_email && (
        <span className="shrink-0 truncate text-xs text-gray-400" title={document.from_email}>
          {document.from_name ?? document.from_email}
        </span>
      )}
      <MatchBadge method={document.match_method} />
      <div className="ml-auto flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" onClick={() => open(document, false)} disabled={busy}>
          {t('common.view')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => open(document, true)} disabled={busy}>
          {t('common.download')}
        </Button>
        {/* Confirmação em dois cliques em vez de modal: apagar um documento assinado é
            irreversível (sai da BD e do Storage), mas é uma acção de arrumação frequente
            o suficiente para não justificar interromper o ecrã. O vermelho só fica sólido
            no segundo clique — o que confirma é que destrói. */}
        {role === 'admin' &&
          (confirmingDelete ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={busy}>
                {t('common.confirm')}
              </Button>
            </>
          ) : (
            <Button variant="dangerGhost" size="sm" onClick={() => setConfirmingDelete(true)} disabled={busy}>
              {t('documents.delete')}
            </Button>
          ))}
      </div>
    </div>
  );
}

/** Documentos assinados de um hospital — mostrado ao expandir a linha na lista de
 *  hospitais. */
export function HospitalSignedDocuments({ hospitalId }: { hospitalId: string }) {
  const t = useT();
  const documents = useSignedDocumentStore((state) => state.documents);
  const hospitalDocuments = documents.filter((document) => document.hospital_id === hospitalId);

  if (hospitalDocuments.length === 0) {
    return (
      <p className="px-2 py-1.5 text-sm text-gray-400">{t('documents.hospitalEmpty')}</p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {hospitalDocuments.map((document) => (
        <DocumentRow key={document.id} document={document} />
      ))}
    </div>
  );
}

/** Aviso no topo da página de hospitais quando há documentos sem hospital. A associação
 *  faz-se num sítio só — Aprovações → Documentos por associar, com os hospitais candidatos
 *  e a escolha da via —, por isso aqui é só o sinal e o caminho para lá: nunca se perde um
 *  PDF assinado, mas também não se deixa a fila a encher em silêncio. */
export function UnmatchedSignedDocuments() {
  const t = useT();
  const documents = useSignedDocumentStore((state) => state.documents);
  const count = documents.filter((document) => !document.hospital_id).length;
  if (count === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3">
      <span className="text-sm font-semibold text-amber-900">{t('orphans.hospitalsNotice', { count })}</span>
      <Link
        to="/approvals?tab=orphans"
        className="ml-auto text-sm font-medium text-amber-900 underline hover:text-amber-700"
      >
        {t('orphans.openQueue')}
      </Link>
    </div>
  );
}
