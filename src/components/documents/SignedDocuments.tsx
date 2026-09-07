import { useState } from 'react';
import { useAuthStore, useSignedDocumentStore, useUiStore } from '../../stores';
import type { HospitalWithZone, SignedDocument, SignedDocumentMatchMethod } from '../../types';
import { Badge, Button } from '../ui';
import { useLang, useT, type TranslationKey } from '../../i18n';

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

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Abrir/descarregar passa sempre por um signed URL pedido no momento: o bucket é privado
 *  e o link só é válido durante alguns minutos. */
function useDocumentActions() {
  const t = useT();
  const getDocumentUrl = useSignedDocumentStore((state) => state.getDocumentUrl);
  const pushToast = useUiStore((state) => state.pushToast);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function open(document: SignedDocument, download: boolean) {
    setBusyId(document.id);
    try {
      const url = await getDocumentUrl(document, { download });
      // _blank + noopener: o link é temporário mas ainda assim não se dá à página aberta
      // acesso ao window.opener.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('documents.openFailed') });
    } finally {
      setBusyId(null);
    }
  }

  return { open, busyId };
}

interface DocumentRowProps {
  document: SignedDocument;
  showMatchBadge?: boolean;
}

function DocumentRow({ document, showMatchBadge = true }: DocumentRowProps) {
  const t = useT();
  const lang = useLang();
  const { open, busyId } = useDocumentActions();
  const deleteSignedDocument = useSignedDocumentStore((state) => state.deleteSignedDocument);
  // Apagar é exclusivo do admin, a espelhar a policy de RLS (migração 0015) — a UI não é
  // a barreira, só evita mostrar um botão que a BD ia recusar.
  const role = useAuthStore((state) => state.profile?.role);
  const pushToast = useUiStore((state) => state.pushToast);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const match = MATCH_META[document.match_method];
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
        {formatDateTime(document.received_at, lang === 'es' ? 'es-ES' : 'pt-PT')}
      </span>
      {document.from_email && (
        <span className="shrink-0 truncate text-xs text-gray-400" title={document.from_email}>
          {document.from_name ?? document.from_email}
        </span>
      )}
      {showMatchBadge && (
        <span title={t(match.titleKey)}>
          <Badge color={match.color}>{t(match.labelKey)}</Badge>
        </span>
      )}
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

/** Fila dos documentos que chegaram sem ser possível identificar o hospital. Aparece no
 *  topo da página de hospitais só quando existe algum — nunca se perde um PDF assinado por
 *  não se ter percebido de quem era, mas também não se deixa a caixa a encher em silêncio. */
export function UnmatchedSignedDocuments({ hospitals }: { hospitals: HospitalWithZone[] }) {
  const t = useT();
  const documents = useSignedDocumentStore((state) => state.documents);
  const assignToHospital = useSignedDocumentStore((state) => state.assignToHospital);
  const profile = useAuthStore((state) => state.profile);
  const canManage = useAuthStore((state) => state.permissions.canApproveSchedule);
  const pushToast = useUiStore((state) => state.pushToast);
  const [assigning, setAssigning] = useState<string | null>(null);

  const unmatched = documents.filter((document) => !document.hospital_id);
  if (unmatched.length === 0) return null;

  async function handleAssign(documentId: string, hospitalId: string) {
    if (!hospitalId) return;
    setAssigning(documentId);
    try {
      await assignToHospital(documentId, hospitalId, profile?.id ?? null);
      pushToast({ variant: 'success', message: t('documents.assigned') });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('documents.assignFailed') });
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3">
      <h2 className="mb-1 text-sm font-semibold text-amber-900">
        {t('documents.unmatchedTitle', { count: unmatched.length })}
      </h2>
      <p className="mb-2 text-xs text-amber-800">{t('documents.unmatchedHint')}</p>
      <div className="flex flex-col gap-1">
        {unmatched.map((document) => (
          <div key={document.id} className="flex flex-col gap-1 rounded-md border border-amber-200 bg-white p-2">
            <DocumentRow document={document} showMatchBadge={false} />
            <div className="flex items-center gap-2 px-2 text-xs text-gray-500">
              <span className="truncate" title={document.subject ?? ''}>
                {t('documents.subject', { subject: document.subject || t('documents.noSubject') })}
              </span>
              {canManage && (
                <select
                  className="ml-auto pm-field"
                  defaultValue=""
                  disabled={assigning === document.id}
                  onChange={(event) => handleAssign(document.id, event.target.value)}
                >
                  <option value="">{t('documents.assignHospital')}</option>
                  {hospitals.map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      {hospital.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
