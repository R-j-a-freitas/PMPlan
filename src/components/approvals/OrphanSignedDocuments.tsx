import { useState } from 'react';
import { Badge, Button, Card, EmptyState } from '../ui';
import { formatDocumentDateTime, useDocumentActions } from '../documents';
import { useAuthStore, useSignedDocumentStore, useUiStore } from '../../stores';
import { useLang, useT, type TranslationKey } from '../../i18n';
import { APPROVAL_TRACK_KEYS } from '../../i18n/labels';
import type { ClientProposal, HospitalWithZone, SignedDocument } from '../../types';

/** Um documento que precisa de uma pessoa: sem hospital (órfão), ou com hospital mas sem
 *  saber de qual das cartas à espera de assinatura é (via por definir). */
export interface OrphanDocumentRow {
  document: SignedDocument;
  kind: 'no_hospital' | 'no_track';
}

interface OrphanSignedDocumentsProps {
  rows: OrphanDocumentRow[];
  hospitals: HospitalWithZone[];
  /** Propostas do ano de planeamento — as vias a que o documento pode ser associado. */
  proposals: ClientProposal[];
  canManage: boolean;
}

// Onde vão parar os documentos assinados que as regras automáticas não conseguiram
// arrumar (ver DOCS/DOCUMENTOS_ASSINADOS.md): nenhum código, nenhum nome de hospital no
// assunto, e um remetente desconhecido ou partilhado por vários hospitais. Nunca se
// descartam — ficam aqui até alguém os associar ao hospital (e, se quiser, à via). Associar
// a uma proposta à espera de assinatura passa-a a "Assinado" (trigger da 0022).
export function OrphanSignedDocuments({ rows, hospitals, proposals, canManage }: OrphanSignedDocumentsProps) {
  const t = useT();
  return (
    <Card
      padded={false}
      title={t('orphans.title', { count: rows.length })}
      subtitle={t('orphans.subtitle')}
    >
      {rows.length === 0 ? (
        <EmptyState>{t('orphans.empty')}</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="pm-table">
            <thead>
              <tr>
                <th className="py-1.5 pr-2">{t('orphans.col.file')}</th>
                <th className="py-1.5 pr-2">{t('orphans.col.receivedAt')}</th>
                <th className="py-1.5 pr-2">{t('orphans.col.from')}</th>
                <th className="py-1.5 pr-2">{t('orphans.col.subject')}</th>
                <th className="py-1.5 pr-2">{t('orphans.col.assign')}</th>
                <th className="py-1.5 pr-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <OrphanRow
                  key={row.document.id}
                  row={row}
                  hospitals={hospitals}
                  proposals={proposals}
                  canManage={canManage}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

interface OrphanRowProps {
  row: OrphanDocumentRow;
  hospitals: HospitalWithZone[];
  proposals: ClientProposal[];
  canManage: boolean;
}

function OrphanRow({ row, hospitals, proposals, canManage }: OrphanRowProps) {
  const t = useT();
  const lang = useLang();
  const { document, kind } = row;
  const { open, busyId } = useDocumentActions();
  const assignToHospital = useSignedDocumentStore((state) => state.assignToHospital);
  const deleteSignedDocument = useSignedDocumentStore((state) => state.deleteSignedDocument);
  const profile = useAuthStore((state) => state.profile);
  const pushToast = useUiStore((state) => state.pushToast);

  // Pré-selecção: o hospital que já se sabe (falta só a via) ou, havendo um único
  // candidato, esse. Com vários candidatos não se escolhe por ninguém.
  const initialHospital =
    document.hospital_id ?? (document.candidate_hospital_ids.length === 1 ? document.candidate_hospital_ids[0] : '');
  const [hospitalId, setHospitalId] = useState(initialHospital);
  const [proposalId, setProposalId] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const candidateIds = new Set(document.candidate_hospital_ids);
  const candidates = hospitals.filter((hospital) => candidateIds.has(hospital.id));
  const others = hospitals.filter((hospital) => !candidateIds.has(hospital.id));
  const hospitalProposals = proposals.filter((proposal) => proposal.hospital_id === hospitalId);
  const busy = saving || busyId === document.id;
  const isAdmin = profile?.role === 'admin';

  async function handleAssign() {
    if (!hospitalId) return;
    setSaving(true);
    try {
      await assignToHospital(document.id, hospitalId, profile?.id ?? null, proposalId || null);
      pushToast({ variant: 'success', message: t('documents.assigned') });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('documents.assignFailed') });
      setSaving(false);
    }
    // Sucesso: a linha sai da lista (o documento deixa de ser órfão), não há estado a repor.
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteSignedDocument(document.id);
      pushToast({ variant: 'success', message: t('documents.deleted') });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('documents.deleteFailed') });
      setSaving(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <tr className="align-top">
      <td className="max-w-[16rem] py-1.5 pr-2">
        <div className="truncate font-medium" title={document.filename}>
          {document.filename}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {kind === 'no_track' ? (
            <Badge color="#F59E0B">{t('orphans.kind.no_track')}</Badge>
          ) : (
            <Badge color="#DC2626">{t('orphans.kind.no_hospital')}</Badge>
          )}
          {candidates.length > 1 && (
            <span title={candidates.map((hospital) => hospital.name).join(', ')}>
              <Badge color="#8B5CF6">{t('orphans.candidates', { count: candidates.length })}</Badge>
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap py-1.5 pr-2">{formatDocumentDateTime(document.received_at, lang)}</td>
      <td className="py-1.5 pr-2" title={document.from_email ?? ''}>
        {document.from_name ?? document.from_email ?? '—'}
        {document.from_name && document.from_email && (
          <div className="text-xs text-gray-400">{document.from_email}</div>
        )}
      </td>
      <td className="max-w-[18rem] truncate py-1.5 pr-2" title={document.subject ?? ''}>
        {document.subject || t('documents.noSubject')}
      </td>
      <td className="py-1.5 pr-2">
        {canManage ? (
          <div className="flex flex-col gap-1">
            <select
              className="pm-field"
              value={hospitalId}
              disabled={busy}
              onChange={(event) => {
                setHospitalId(event.target.value);
                setProposalId('');
              }}
            >
              <option value="">{t('documents.assignHospital')}</option>
              {/* Os candidatos à cabeça: são 2 ou 3 entre dezenas de hospitais. */}
              {candidates.length > 0 && (
                <optgroup label={t('orphans.candidatesGroup')}>
                  {candidates.map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      {hospital.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={t('orphans.allHospitals')}>
                {others.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>
                    {hospital.name}
                  </option>
                ))}
              </optgroup>
            </select>
            {hospitalProposals.length > 0 && (
              <select
                className="pm-field"
                value={proposalId}
                disabled={busy}
                onChange={(event) => setProposalId(event.target.value)}
                title={t('orphans.trackHint')}
              >
                <option value="">{t('orphans.trackAuto')}</option>
                {hospitalProposals.map((proposal) => (
                  <option key={proposal.id} value={proposal.id}>
                    {t(APPROVAL_TRACK_KEYS[proposal.approval_track])} — {t(`stage.${proposal.stage}` as TranslationKey)}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400">{t('orphans.noPermission')}</span>
        )}
      </td>
      <td className="py-1.5 pr-2 text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => open(document, false)} disabled={busy}>
            {t('common.view')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => open(document, true)} disabled={busy}>
            {t('common.download')}
          </Button>
          {canManage && (
            <Button size="sm" onClick={handleAssign} disabled={busy || !hospitalId}>
              {t('orphans.assign')}
            </Button>
          )}
          {/* Descartar é para o que não é uma carta assinada (um PDF qualquer que entrou
              pela caixa). Só admin, a espelhar a RLS; confirmação em dois cliques. */}
          {isAdmin &&
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
      </td>
    </tr>
  );
}
