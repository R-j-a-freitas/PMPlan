import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { TemplateEditor } from '../components/approvals';
import { Badge, Button } from '../components/ui';
import { buildProposalLetterData, generateProposalLetterPdf } from '../lib/exporters/letterPdf';
import type { ProposalLetterData } from '../lib/exporters/letterPdf';
import { buildProposalIcs, downloadIcs } from '../lib/exporters/proposalIcs';
import { buildProposalEmailTableHtml, renderProposalEmail, sendProposalEmail } from '../lib/proposalEmail';
import type { EmailAttachment } from '../lib/proposalEmail';
import {
  useAuthStore,
  useCalendarStore,
  useEngineerStore,
  useEquipmentStore,
  useHospitalStore,
  useProposalStore,
  useTemplateStore,
  useUiStore,
} from '../stores';
import type { ClientProposal, EmailTemplateKey, EquipmentFull, HospitalWithZone, PMEvent, ProposalStage } from '../types';

// btoa() só lida com Latin1 — o .ics tem acentuação (ex: "Manutenção"), por isso passa
// primeiro por encodeURIComponent/unescape para ficar seguro em UTF-8.
function utf8ToBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

// O "From" só pode usar o domínio verificado na conta Resend (stockmate.pt, emprestada
// — ver memória do projecto), por isso a Teresa não pode ir lá; fica sempre em CC para
// que os hospitais a vejam directamente como contacto Elekta em todos os envios.
const TERESA_EMAIL = 'teresa.matos@elekta.com';

interface HospitalBundle {
  hospital: HospitalWithZone;
  equipmentList: EquipmentFull[];
  events: PMEvent[];
  proposal: ClientProposal | null;
  engineerEmails: string[];
  clientEmails: string[];
}

const STAGE_LABELS: Record<ProposalStage, string> = {
  draft: 'Por enviar',
  pending_engineer: 'Aguarda engenheiro',
  engineer_approved: 'Aprovado (engenheiro)',
  pending_client: 'Aguarda cliente',
  client_approved: 'Aprovado (cliente)',
  letter_sent: 'Carta enviada',
  signed: 'Assinado',
  rejected: 'Rejeitado',
};

const STAGE_COLORS: Record<ProposalStage, string> = {
  draft: '#9CA3AF',
  pending_engineer: '#F59E0B',
  engineer_approved: '#3B82F6',
  pending_client: '#F59E0B',
  client_approved: '#3B82F6',
  letter_sent: '#8B5CF6',
  signed: '#16A34A',
  rejected: '#DC2626',
};

type ActionKey =
  | 'send_engineer'
  | 'resend_engineer'
  | 'confirm_engineer'
  | 'send_client'
  | 'resend_client'
  | 'confirm_client'
  | 'send_letter'
  | 'confirm_signed';

// Para além da acção principal (nextAction, que avança o estado), as fases "a aguardar
// resposta" também mostram um botão de reenvio — caso o engenheiro/cliente não responda,
// reenvia o mesmo email sem mudar de estado.
function resendAction(stage: ProposalStage): { key: ActionKey; label: string } | null {
  switch (stage) {
    case 'pending_engineer':
      return { key: 'resend_engineer', label: 'Reenviar a engenheiro' };
    case 'pending_client':
      return { key: 'resend_client', label: 'Reenviar a cliente' };
    default:
      return null;
  }
}

function nextAction(stage: ProposalStage): { key: ActionKey; label: string } | null {
  switch (stage) {
    case 'draft':
      return { key: 'send_engineer', label: 'Enviar a engenheiro' };
    case 'pending_engineer':
      return { key: 'confirm_engineer', label: 'Marcar aprovado (engenheiro)' };
    case 'engineer_approved':
      return { key: 'send_client', label: 'Enviar a cliente' };
    case 'pending_client':
      return { key: 'confirm_client', label: 'Marcar aprovado (cliente)' };
    case 'client_approved':
      return { key: 'send_letter', label: 'Enviar carta de assinatura' };
    case 'letter_sent':
      return { key: 'confirm_signed', label: 'Marcar como assinado' };
    case 'signed':
    case 'rejected':
      return null;
  }
}

// Aprovação e Envio de Propostas a Clientes (secção: TL confirma com engenheiros →
// propõe ao cliente → cliente aprova → carta de assinatura). Uma proposta agrupa todas
// as PMs de um hospital no ano de planeamento activo — é a unidade de envio/aprovação.
export function Approvals() {
  const canAct = useAuthStore((state) => state.permissions.canApproveSchedule || state.permissions.canSendEmails);
  const profile = useAuthStore((state) => state.profile);
  const planningYear = useCalendarStore((state) => state.planningYear);
  const yearEvents = useCalendarStore((state) => state.yearEvents);
  const fetchYearEvents = useCalendarStore((state) => state.fetchYearEvents);
  const hospitals = useHospitalStore((state) => state.hospitals);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  const equipment = useEquipmentStore((state) => state.equipment);
  const fetchEquipment = useEquipmentStore((state) => state.fetchEquipment);
  const engineers = useEngineerStore((state) => state.engineers);
  const fetchEngineers = useEngineerStore((state) => state.fetchEngineers);
  const proposals = useProposalStore((state) => state.proposals);
  const fetchProposals = useProposalStore((state) => state.fetchProposals);
  const getOrCreateProposal = useProposalStore((state) => state.getOrCreateProposal);
  const updateProposal = useProposalStore((state) => state.updateProposal);
  const setProposalEvents = useProposalStore((state) => state.setProposalEvents);
  const logEmailSent = useProposalStore((state) => state.logEmailSent);
  const templates = useTemplateStore((state) => state.templates);
  const fetchTemplates = useTemplateStore((state) => state.fetchTemplates);
  const pushToast = useUiStore((state) => state.pushToast);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetchHospitals();
    fetchEquipment();
    fetchEngineers();
    fetchTemplates();
  }, [fetchHospitals, fetchEquipment, fetchEngineers, fetchTemplates]);

  useEffect(() => {
    fetchYearEvents(planningYear);
    fetchProposals(planningYear);
  }, [planningYear, fetchYearEvents, fetchProposals]);

  const bundles = useMemo<HospitalBundle[]>(() => {
    return hospitals
      .map((hospital): HospitalBundle => {
        const equipmentList = equipment.filter((item) => item.hospital_id === hospital.id);
        const equipmentIds = new Set(equipmentList.map((item) => item.id));
        const events = yearEvents.filter((event) => equipmentIds.has(event.equipment_id) && event.status !== 'cancelled');
        const proposal = proposals.find((item) => item.hospital_id === hospital.id) ?? null;
        const engineerEmails = [
          ...new Set(
            events
              .map((event) => engineers.find((engineer) => engineer.id === event.engineer_id)?.email)
              .filter((email): email is string => !!email),
          ),
        ];
        const clientEmails = hospital.contacts.map((contact) => contact.email).filter((email): email is string => !!email);
        return { hospital, equipmentList, events, proposal, engineerEmails, clientEmails };
      })
      .filter((bundle) => bundle.events.length > 0)
      .sort((a, b) => a.hospital.name.localeCompare(b.hospital.name));
  }, [hospitals, equipment, yearEvents, proposals, engineers]);

  function letterDataFor(bundle: HospitalBundle): ProposalLetterData {
    return buildProposalLetterData(bundle.hospital.name, bundle.hospital.country, planningYear, bundle.equipmentList, bundle.events);
  }

  // Sem App Registration no Azure AD disponível (sem permissões para o criar) — não há
  // Microsoft Graph Mail.Send possível. Envia-se via Resend (Edge Function
  // send-proposal-email — a chave da API nunca chega ao browser, ver lib/proposalEmail).
  // O admin que envia e a Teresa (contacto Elekta — ver TERESA_EMAIL) ficam sempre em CC.
  async function sendTemplateEmail(
    bundle: HospitalBundle,
    templateKey: EmailTemplateKey,
    to: string[],
    attachments?: EmailAttachment[],
  ) {
    // Versão PT ou ES consoante o país do hospital (hospitals.country) — nunca uma única
    // versão fixa (secção: "estes emails e cartas têm de ser em PT ou ES conforme o cliente").
    const template = templates.find((item) => item.key === templateKey && item.country === bundle.hospital.country);
    if (!template) throw new Error(`Template "${templateKey}" (${bundle.hospital.country}) não encontrado.`);
    const tableHtml = buildProposalEmailTableHtml(letterDataFor(bundle));
    const engenheiro = bundle.hospital.country === 'ES' ? 'Equipo técnico' : 'Equipa técnica';
    const { subject, htmlBody } = renderProposalEmail(
      template,
      { ano: String(planningYear), hospital: bundle.hospital.name, engenheiro },
      tableHtml,
    );
    const cc = [...new Set([...(profile?.email ? [profile.email] : []), TERESA_EMAIL])];
    await sendProposalEmail({
      to,
      cc,
      subject,
      html: htmlBody,
      attachments,
    });
    const proposal = await getOrCreateProposal(bundle.hospital.id, planningYear);
    await setProposalEvents(
      proposal.id,
      bundle.events.map((event) => event.id),
    );
    await logEmailSent({
      proposalId: proposal.id,
      templateKey,
      recipientEmails: to,
      subject,
      sentBy: profile?.id ?? null,
    });
    return proposal;
  }

  async function runAction(bundle: HospitalBundle, action: ActionKey) {
    setBusyId(bundle.hospital.id);
    try {
      switch (action) {
        case 'send_engineer': {
          if (bundle.engineerEmails.length === 0) {
            throw new Error(`Sem email de engenheiro associado às PMs de ${bundle.hospital.name}.`);
          }
          const proposal = await sendTemplateEmail(bundle, 'engineer_approval', bundle.engineerEmails);
          await updateProposal(proposal.id, { stage: 'pending_engineer' });
          break;
        }
        case 'resend_engineer': {
          if (bundle.engineerEmails.length === 0) {
            throw new Error(`Sem email de engenheiro associado às PMs de ${bundle.hospital.name}.`);
          }
          await sendTemplateEmail(bundle, 'engineer_approval', bundle.engineerEmails);
          break;
        }
        case 'confirm_engineer': {
          const proposal = await getOrCreateProposal(bundle.hospital.id, planningYear);
          await updateProposal(proposal.id, {
            stage: 'engineer_approved',
            engineer_approved_at: new Date().toISOString(),
            engineer_approved_by: profile?.id ?? null,
          });
          break;
        }
        case 'send_client': {
          if (bundle.clientEmails.length === 0) {
            throw new Error(`Sem contactos de email para ${bundle.hospital.name} — adiciona em Hospitais → Contactos.`);
          }
          const proposal = await sendTemplateEmail(bundle, 'client_proposal', bundle.clientEmails);
          await updateProposal(proposal.id, { stage: 'pending_client' });
          break;
        }
        case 'resend_client': {
          if (bundle.clientEmails.length === 0) {
            throw new Error(`Sem contactos de email para ${bundle.hospital.name} — adiciona em Hospitais → Contactos.`);
          }
          await sendTemplateEmail(bundle, 'client_proposal', bundle.clientEmails);
          break;
        }
        case 'confirm_client': {
          const proposal = await getOrCreateProposal(bundle.hospital.id, planningYear);
          await updateProposal(proposal.id, {
            stage: 'client_approved',
            client_approved_at: new Date().toISOString(),
            client_approved_by: profile?.id ?? null,
          });
          break;
        }
        case 'send_letter': {
          if (bundle.clientEmails.length === 0) {
            throw new Error(`Sem contactos de email para ${bundle.hospital.name} — adiciona em Hospitais → Contactos.`);
          }
          // Carta (PDF) + calendário (.ics) vão como anexos reais — Resend suporta
          // anexos, ao contrário do mailto: usado antes.
          const doc = await generateProposalLetterPdf(letterDataFor(bundle));
          const pdfBase64 = doc.output('datauristring').split(',')[1] ?? '';
          const baseName = `${bundle.hospital.name.replace(/\s+/g, '_')}_${planningYear}`;
          const ics = buildProposalIcs(bundle.hospital.name, bundle.equipmentList, bundle.events);
          const proposal = await sendTemplateEmail(bundle, 'signature_letter', bundle.clientEmails, [
            { filename: `Plano_Manutencao_${baseName}.pdf`, content: pdfBase64 },
            { filename: `PMs_${baseName}.ics`, content: utf8ToBase64(ics) },
          ]);
          await updateProposal(proposal.id, {
            stage: 'letter_sent',
            letter_sent_at: new Date().toISOString(),
            letter_sent_to: bundle.clientEmails,
          });
          break;
        }
        case 'confirm_signed': {
          const proposal = await getOrCreateProposal(bundle.hospital.id, planningYear);
          await updateProposal(proposal.id, {
            stage: 'signed',
            signed_at: new Date().toISOString(),
            signed_by: profile?.id ?? null,
          });
          break;
        }
      }
      const isSendAction = action.startsWith('send_') || action.startsWith('resend_');
      pushToast({
        variant: 'success',
        message: isSendAction ? `${bundle.hospital.name}: email enviado.` : `${bundle.hospital.name}: estado actualizado.`,
      });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha na acção.' });
    } finally {
      setBusyId(null);
    }
  }

  async function previewPdf(bundle: HospitalBundle) {
    const doc = await generateProposalLetterPdf(letterDataFor(bundle));
    doc.output('dataurlnewwindow');
  }

  // Um VEVENT por PM (intervalo real, não expandido dia-a-dia) — qualquer calendário
  // importa com um duplo-clique, sem precisar de Azure/Graph.
  function downloadCalendar(bundle: HospitalBundle) {
    const ics = buildProposalIcs(bundle.hospital.name, bundle.equipmentList, bundle.events);
    downloadIcs(`PMs_${bundle.hospital.name.replace(/\s+/g, '_')}_${planningYear}.ics`, ics);
  }

  async function runBulkAction() {
    const selected = bundles.filter((bundle) => selectedIds.has(bundle.hospital.id));
    for (const bundle of selected) {
      const action = nextAction(bundle.proposal?.stage ?? 'draft');
      if (action) await runAction(bundle, action.key);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === bundles.length ? new Set() : new Set(bundles.map((bundle) => bundle.hospital.id))));
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-1 text-lg font-semibold text-gray-900">Aprovações — Envio de Propostas a Clientes</h1>
        <p className="mb-4 text-sm text-gray-500">
          Ano de planeamento {planningYear}. Cada hospital agrupa todas as PMs do ano — confirma com o engenheiro,
          envia a proposta ao cliente e, depois de aprovada, envia a carta de assinatura.
        </p>

        {canAct && <TemplateEditor />}

        {bundles.length === 0 && (
          <p className="rounded-md border border-gray-200 p-4 text-sm text-gray-500">
            Sem PMs agendadas para {planningYear}.
          </p>
        )}

        {bundles.length > 0 && (
          <>
            {canAct && (
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm text-gray-600">{selectedIds.size} seleccionado(s)</span>
                <Button variant="secondary" onClick={runBulkAction} disabled={selectedIds.size === 0 || busyId !== null}>
                  Avançar seleccionados
                </Button>
              </div>
            )}

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  {canAct && (
                    <th className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === bundles.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}
                  <th className="py-1.5 pr-2">Hospital</th>
                  <th className="py-1.5 pr-2">País</th>
                  <th className="py-1.5 pr-2">Equipamentos</th>
                  <th className="py-1.5 pr-2">Dias-PM</th>
                  <th className="py-1.5 pr-2">Estado</th>
                  <th className="py-1.5 pr-2" />
                </tr>
              </thead>
              <tbody>
                {bundles.map((bundle) => {
                  const stage = bundle.proposal?.stage ?? 'draft';
                  const action = nextAction(stage);
                  const resend = resendAction(stage);
                  const busy = busyId === bundle.hospital.id;
                  return (
                    <tr key={bundle.hospital.id} className="border-b border-gray-100">
                      {canAct && (
                        <td className="py-1.5 pr-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(bundle.hospital.id)}
                            onChange={() => toggleSelected(bundle.hospital.id)}
                          />
                        </td>
                      )}
                      <td className="py-1.5 pr-2">{bundle.hospital.name}</td>
                      <td className="py-1.5 pr-2">{bundle.hospital.country}</td>
                      <td className="py-1.5 pr-2">{bundle.equipmentList.length}</td>
                      <td className="py-1.5 pr-2">{bundle.events.length}</td>
                      <td className="py-1.5 pr-2">
                        <Badge color={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Badge>
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" onClick={() => previewPdf(bundle)}>
                            Pré-visualizar PDF
                          </Button>
                          <Button variant="secondary" onClick={() => downloadCalendar(bundle)}>
                            Descarregar .ics
                          </Button>
                          {canAct && resend && (
                            <Button variant="secondary" onClick={() => runAction(bundle, resend.key)} disabled={busy}>
                              {resend.label}
                            </Button>
                          )}
                          {canAct && action && (
                            <Button onClick={() => runAction(bundle, action.key)} disabled={busy}>
                              {action.label}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
