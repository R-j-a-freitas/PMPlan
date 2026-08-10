import { useState } from 'react';
import { useAuthStore, useSignedDocumentStore, useUiStore } from '../../stores';
import type { HospitalWithZone, SignedDocument, SignedDocumentMatchMethod } from '../../types';
import { Badge, Button } from '../ui';

// Quão fiável foi a associação ao hospital. Um documento identificado pelo código da
// proposta é certo; um identificado pelo email do remetente é um palpite informado — e
// quem está a olhar para o arquivo tem de conseguir ver a diferença sem ir à BD.
const MATCH_LABELS: Record<SignedDocumentMatchMethod, { label: string; color: string; title: string }> = {
  reference_code: {
    label: 'Código',
    color: '#16A34A',
    title: 'Identificado pelo código da proposta no assunto — associação inequívoca.',
  },
  subject_hospital: {
    label: 'Assunto',
    color: '#3B82F6',
    title: 'Identificado pelo nome do hospital no assunto do email.',
  },
  sender_email: {
    label: 'Remetente',
    color: '#F59E0B',
    title: 'Identificado pelo email do remetente coincidir com um contacto do hospital — vale a pena confirmar.',
  },
  manual: { label: 'Manual', color: '#8B5CF6', title: 'Associado à mão por um utilizador.' },
  unmatched: { label: 'Por associar', color: '#DC2626', title: 'Não foi possível identificar o hospital.' },
};

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', {
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
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao abrir o documento.' });
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
  const { open, busyId } = useDocumentActions();
  const deleteSignedDocument = useSignedDocumentStore((state) => state.deleteSignedDocument);
  // Apagar é exclusivo do admin, a espelhar a policy de RLS (migração 0015) — a UI não é
  // a barreira, só evita mostrar um botão que a BD ia recusar.
  const role = useAuthStore((state) => state.profile?.role);
  const pushToast = useUiStore((state) => state.pushToast);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const match = MATCH_LABELS[document.match_method];
  const busy = busyId === document.id;

  async function handleDelete() {
    try {
      await deleteSignedDocument(document.id);
      pushToast({ variant: 'success', message: 'Documento apagado.' });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao apagar.' });
    } finally {
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 px-2 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium" title={document.filename}>
        {document.filename}
      </span>
      <span className="shrink-0 text-xs text-gray-400">{formatSize(document.size_bytes)}</span>
      <span className="shrink-0 text-xs text-gray-500" title={document.subject ?? ''}>
        {formatDateTime(document.received_at)}
      </span>
      {document.from_email && (
        <span className="shrink-0 truncate text-xs text-gray-400" title={document.from_email}>
          {document.from_name ?? document.from_email}
        </span>
      )}
      {showMatchBadge && (
        <span title={match.title}>
          <Badge color={match.color}>{match.label}</Badge>
        </span>
      )}
      <div className="ml-auto flex shrink-0 gap-2">
        <Button variant="secondary" onClick={() => open(document, false)} disabled={busy}>
          Ver
        </Button>
        <Button variant="secondary" onClick={() => open(document, true)} disabled={busy}>
          Descarregar
        </Button>
        {/* Confirmação em dois cliques em vez de modal: apagar um documento assinado é
            irreversível (sai da BD e do Storage), mas é uma acção de arrumação frequente
            o suficiente para não justificar interromper o ecrã. */}
        {role === 'admin' &&
          (confirmingDelete ? (
            <>
              <Button variant="danger" onClick={handleDelete} disabled={busy}>
                Confirmar
              </Button>
              <Button variant="secondary" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
              Apagar
            </Button>
          ))}
      </div>
    </div>
  );
}

/** Documentos assinados de um hospital — mostrado ao expandir a linha na lista de
 *  hospitais. */
export function HospitalSignedDocuments({ hospitalId }: { hospitalId: string }) {
  const documents = useSignedDocumentStore((state) => state.documents);
  const hospitalDocuments = documents.filter((document) => document.hospital_id === hospitalId);

  if (hospitalDocuments.length === 0) {
    return (
      <p className="px-2 py-1.5 text-sm text-gray-400">
        Sem documentos assinados recebidos. Chegam automaticamente quando o cliente responde à carta de assinatura
        com o PDF em anexo.
      </p>
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
      pushToast({ variant: 'success', message: 'Documento associado ao hospital.' });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao associar.' });
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3">
      <h2 className="mb-1 text-sm font-semibold text-amber-900">
        {unmatched.length} documento(s) assinado(s) por associar
      </h2>
      <p className="mb-2 text-xs text-amber-800">
        Chegaram por email mas não foi possível identificar o hospital — normalmente porque a resposta perdeu o
        código da proposta no assunto. Escolhe o hospital para os arquivar.
      </p>
      <div className="flex flex-col gap-1">
        {unmatched.map((document) => (
          <div key={document.id} className="flex flex-col gap-1 rounded-md border border-amber-200 bg-white p-2">
            <DocumentRow document={document} showMatchBadge={false} />
            <div className="flex items-center gap-2 px-2 text-xs text-gray-500">
              <span className="truncate" title={document.subject ?? ''}>
                Assunto: {document.subject || '(sem assunto)'}
              </span>
              {canManage && (
                <select
                  className="ml-auto rounded-md border border-gray-300 px-2 py-1 text-sm"
                  defaultValue=""
                  disabled={assigning === document.id}
                  onChange={(event) => handleAssign(document.id, event.target.value)}
                >
                  <option value="">Associar a hospital…</option>
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
