import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { EmailRecipientsEditor, TemplateEditor } from '../components/approvals';
import { Badge, Button } from '../components/ui';
import { buildProposalLetterData, generateProposalLetterPdf } from '../lib/exporters/letterPdf';
import type { ProposalLetterData } from '../lib/exporters/letterPdf';
import { buildProposalIcs, downloadIcs } from '../lib/exporters/proposalIcs';
import {
  buildProposalEmailTableHtml,
  renderProposalEmail,
  sendProposalEmail,
  withReferenceCode,
  SIGNED_DOCUMENTS_MAILBOX,
} from '../lib/proposalEmail';
import type { EmailAttachment } from '../lib/proposalEmail';
import {
  APPROVAL_TRACKS,
  APPROVAL_TRACK_COLORS,
  APPROVAL_TRACK_LABELS,
  resolveApprovalTrack,
  templateKeyFor,
} from '../lib/approvalTrack';
import { resolveZoneTeamLeaderId } from '../lib/zoneTree';
import {
  SETTING_INCLUDE_TEAM_LEADERS,
  useAppSettingsStore,
  useAuthStore,
  useCalendarStore,
  useEmailRecipientStore,
  useEngineerStore,
  useEquipmentStore,
  useHospitalStore,
  useModalityStore,
  useProposalStore,
  useTemplateStore,
  useUiStore,
  useZoneStore,
} from '../stores';
import type {
  ApprovalTrack,
  ClientProposal,
  Engineer,
  EmailTemplateStep,
  EquipmentFull,
  HospitalWithZone,
  PMEvent,
  ProposalStage,
} from '../types';

// btoa() só lida com Latin1 — o .ics tem acentuação (ex: "Manutenção"), por isso passa
// primeiro por encodeURIComponent/unescape para ficar seguro em UTF-8.
function utf8ToBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

// Os destinatários fixos em CC (ex.: a Teresa, contacto Elekta) já não estão hardcoded —
// vivem na tabela email_recipients e são geridos na app (tab "Destinatários em CC", ver
// EmailRecipientsEditor). O "From" só pode usar o domínio verificado na conta Resend
// (stockmate.pt, emprestada — ver memória do projecto), por isso estas pessoas vão sempre
// em CC e não como remetente.
/** Uma linha da tabela = um hospital numa via de aprovação. A braquiterapia é um processo
 *  independente (migração 0017): o mesmo hospital pode aparecer duas vezes, em fases
 *  diferentes, porque a validação do engenheiro, a aprovação do cliente, a carta e a
 *  assinatura de uma via não têm nada a ver com as da outra. */
interface HospitalBundle {
  hospital: HospitalWithZone;
  track: ApprovalTrack;
  /** Chave estável da linha (hospital + via) — usada na selecção e no estado "ocupado",
   *  que antes eram por hospital e passariam a mexer nas duas vias ao mesmo tempo. */
  key: string;
  equipmentList: EquipmentFull[];
  events: PMEvent[];
  proposal: ClientProposal | null;
  engineerNames: string[];
  engineerEmails: string[];
  clientEmails: string[];
  /** Team Leader da zona do hospital (ou o herdado da zona-mãe) — vai sempre em CC nos
   *  emails ao cliente. null = zona sem TL definido, sinalizado na linha da tabela. */
  teamLeader: Engineer | null;
}

function bundleKey(hospitalId: string, track: ApprovalTrack): string {
  return `${hospitalId}::${track}`;
}

/** Prefixo dos nomes de ficheiro (PDF/.ics) da via. A geral não leva nenhum — é o nome
 *  que os clientes já conhecem e não há razão para o mudar. */
function trackFileTag(track: ApprovalTrack): string {
  return track === 'brachytherapy' ? 'Braquiterapia_' : '';
}

/** Nome do hospital com a via, para as mensagens de erro/sucesso. Sem a via, duas linhas
 *  do mesmo hospital dariam avisos indistinguíveis. */
function bundleLabel(bundle: HospitalBundle): string {
  return bundle.track === 'standard'
    ? bundle.hospital.name
    : `${bundle.hospital.name} (${APPROVAL_TRACK_LABELS[bundle.track]})`;
}

const TRACK_COLUMN_TITLES: Record<ApprovalTrack, string> = {
  standard: 'Processo geral do hospital — todos os equipamentos que não são de uma via própria.',
  brachytherapy:
    'Processo independente: validação, aprovação, carta e assinatura próprias dos equipamentos de Braquiterapia.',
};

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
  | 'resend_letter'
  | 'confirm_signed';

// Para além da acção principal (nextAction, que avança o estado), as fases "a aguardar
// resposta" também mostram um botão de reenvio — caso o engenheiro/cliente não responda,
// reenvia o mesmo email sem mudar de estado.
//
// Depois de 'letter_sent'/'signed' o reenvio serve outro propósito: as datas de uma PM
// podem mudar (pedido do cliente ou nosso) já depois de a carta ter ido — e nesse caso a
// carta assinada deixa de corresponder ao plano. A carta é sempre regerada a partir das
// PMs actuais no momento do envio, por isso reenviar produz o PDF actualizado.
function resendAction(stage: ProposalStage): { key: ActionKey; label: string } | null {
  switch (stage) {
    case 'pending_engineer':
      return { key: 'resend_engineer', label: 'Reenviar a engenheiro' };
    case 'pending_client':
      return { key: 'resend_client', label: 'Reenviar a cliente' };
    case 'letter_sent':
      return { key: 'resend_letter', label: 'Reenviar carta' };
    case 'signed':
      return { key: 'resend_letter', label: 'Reenviar carta actualizada' };
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
// propõe ao cliente → cliente aprova → carta de assinatura). Uma proposta agrupa as PMs de
// um hospital numa via de aprovação, no ano de planeamento activo — é essa a unidade de
// envio/aprovação. Os equipamentos de braquiterapia formam uma via própria (migração 0017),
// que corre a mesma sequência em paralelo e sem dependência da via geral.
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
  // Modalidades: é delas que sai a via de aprovação de cada equipamento (0017).
  const modalities = useModalityStore((state) => state.modalities);
  const fetchModalities = useModalityStore((state) => state.fetchModalities);
  const zones = useZoneStore((state) => state.zones);
  const fetchZones = useZoneStore((state) => state.fetchZones);
  const proposals = useProposalStore((state) => state.proposals);
  const fetchProposals = useProposalStore((state) => state.fetchProposals);
  const getOrCreateProposal = useProposalStore((state) => state.getOrCreateProposal);
  const updateProposal = useProposalStore((state) => state.updateProposal);
  const setProposalEvents = useProposalStore((state) => state.setProposalEvents);
  const logEmailSent = useProposalStore((state) => state.logEmailSent);
  const templates = useTemplateStore((state) => state.templates);
  const fetchTemplates = useTemplateStore((state) => state.fetchTemplates);
  const recipients = useEmailRecipientStore((state) => state.recipients);
  const fetchRecipients = useEmailRecipientStore((state) => state.fetchRecipients);
  const fetchAppSettings = useAppSettingsStore((state) => state.fetchAppSettings);
  const appSettings = useAppSettingsStore((state) => state.settings);
  // Por omissão incluir: desligar é a excepção temporária dos testes, e uma definição
  // ainda por carregar não pode significar "não enviar ao TL".
  const includeTeamLeaders =
    typeof appSettings[SETTING_INCLUDE_TEAM_LEADERS] === 'boolean'
      ? (appSettings[SETTING_INCLUDE_TEAM_LEADERS] as boolean)
      : true;
  const pushToast = useUiStore((state) => state.pushToast);

  // Selecção e "ocupado" passam a ser por linha (hospital + via, ver bundleKey) — por
  // hospital, avançar a via geral bloqueava também a da braquiterapia, que é um processo
  // à parte e pode estar a ser trabalhado ao mesmo tempo.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'approvals' | 'templates' | 'recipients'>('approvals');
  // Filtro de via: com dois processos por hospital a lista duplica de tamanho, e quem está
  // a tratar da braquiterapia quer ver só essas linhas.
  const [trackFilter, setTrackFilter] = useState<ApprovalTrack | 'all'>('all');
  // Hospital cujo workflow o utilizador pediu para reiniciar — aberto o modal de
  // confirmação enquanto não for null (reiniciar implica revalidar engenheiro + cliente).
  const [resetTarget, setResetTarget] = useState<HospitalBundle | null>(null);
  // Idem para o reenvio da carta de um hospital já assinado: reenviar invalida a assinatura
  // que estava registada, por isso não é uma acção para disparar num clique distraído.
  const [resendLetterTarget, setResendLetterTarget] = useState<HospitalBundle | null>(null);

  useEffect(() => {
    fetchHospitals();
    fetchEquipment();
    fetchEngineers();
    fetchTemplates();
    fetchRecipients();
    fetchModalities();
    // Zonas: é delas que sai o Team Leader que entra em CC nos emails ao cliente.
    fetchZones();
    // Definições: o interruptor que inclui (ou não) os TLs nesses envios.
    fetchAppSettings();
  }, [
    fetchHospitals,
    fetchEquipment,
    fetchEngineers,
    fetchTemplates,
    fetchRecipients,
    fetchModalities,
    fetchZones,
    fetchAppSettings,
  ]);

  useEffect(() => {
    fetchYearEvents(planningYear);
    fetchProposals(planningYear);
  }, [planningYear, fetchYearEvents, fetchProposals]);

  // Um bundle por (hospital, via): o equipamento do hospital é primeiro repartido pelas
  // vias (a via vem da modalidade — ver resolveApprovalTrack) e só depois se monta o
  // conjunto de PMs, engenheiros e proposta de cada uma. Vias sem PMs no ano não geram
  // linha, tal como antes acontecia a hospitais sem PMs.
  const bundles = useMemo<HospitalBundle[]>(() => {
    return hospitals
      .flatMap((hospital) =>
        APPROVAL_TRACKS.map((track): HospitalBundle => {
          const equipmentList = equipment.filter(
            (item) => item.hospital_id === hospital.id && resolveApprovalTrack(item.modality, modalities) === track,
          );
          const equipmentIds = new Set(equipmentList.map((item) => item.id));
          const events = yearEvents.filter(
            (event) => equipmentIds.has(event.equipment_id) && event.status !== 'cancelled',
          );
          const proposal =
            proposals.find((item) => item.hospital_id === hospital.id && item.approval_track === track) ?? null;
          // Engenheiros distintos atribuídos às PMs desta via — nomes e emails são
          // recolhidos em paralelo a partir dos mesmos eventos, para o placeholder
          // {{engenheiro}} usar sempre o(s) nome(s) reais em vez de um genérico. Por via,
          // e não por hospital: quem valida a braquiterapia não é quem valida o resto.
          const bundleEngineers = [
            ...new Map(
              events
                .map((event) => engineers.find((engineer) => engineer.id === event.engineer_id))
                .filter((engineer): engineer is (typeof engineers)[number] => !!engineer)
                .map((engineer) => [engineer.id, engineer]),
            ).values(),
          ];
          const engineerNames = bundleEngineers.map((engineer) => engineer.name);
          const engineerEmails = [...new Set(bundleEngineers.map((engineer) => engineer.email).filter(Boolean))];
          const clientEmails = hospital.contacts
            .map((contact) => contact.email)
            .filter((email): email is string => !!email);
          // TL da zona do hospital, ou o da zona-mãe mais próxima que tenha um (só é preciso
          // configurá-lo nas zonas de topo — ver resolveZoneTeamLeaderId).
          const teamLeaderId = resolveZoneTeamLeaderId(hospital.zone_id, zones);
          const teamLeader = engineers.find((engineer) => engineer.id === teamLeaderId) ?? null;
          return {
            hospital,
            track,
            key: bundleKey(hospital.id, track),
            equipmentList,
            events,
            proposal,
            engineerNames,
            engineerEmails,
            clientEmails,
            teamLeader,
          };
        }),
      )
      .filter((bundle) => bundle.events.length > 0)
      .sort(
        (a, b) =>
          a.hospital.name.localeCompare(b.hospital.name) ||
          APPROVAL_TRACKS.indexOf(a.track) - APPROVAL_TRACKS.indexOf(b.track),
      );
  }, [hospitals, equipment, modalities, yearEvents, proposals, engineers, zones]);

  const visibleBundles = useMemo(
    () => (trackFilter === 'all' ? bundles : bundles.filter((bundle) => bundle.track === trackFilter)),
    [bundles, trackFilter],
  );

  const trackFilterOptions: { key: ApprovalTrack | 'all'; label: string }[] = [
    { key: 'all', label: 'Todas' },
    ...APPROVAL_TRACKS.map((track) => ({ key: track, label: APPROVAL_TRACK_LABELS[track] })),
  ];

  function letterDataFor(bundle: HospitalBundle): ProposalLetterData {
    return buildProposalLetterData(
      bundle.hospital.name,
      bundle.hospital.country,
      planningYear,
      bundle.equipmentList,
      bundle.events,
      bundle.track,
    );
  }

  // Sem App Registration no Azure AD disponível (sem permissões para o criar) — não há
  // Microsoft Graph Mail.Send possível. Envia-se via Resend (Edge Function
  // send-proposal-email — a chave da API nunca chega ao browser, ver lib/proposalEmail).
  // O admin que envia fica sempre em CC, mais os destinatários fixos activos (geridos na
  // app — tabela email_recipients, tab "Destinatários em CC").
  async function sendTemplateEmail(
    bundle: HospitalBundle,
    step: EmailTemplateStep,
    to: string[],
    attachments?: EmailAttachment[],
  ) {
    // A via escolhe o template (a braquiterapia tem os seus, `brachy_*`), o país escolhe o
    // idioma — nunca uma única versão fixa (secção: "estes emails e cartas têm de ser em PT
    // ou ES conforme o cliente").
    const templateKey = templateKeyFor(bundle.track, step);
    const template = templates.find((item) => item.key === templateKey && item.country === bundle.hospital.country);
    if (!template) throw new Error(`Template "${templateKey}" (${bundle.hospital.country}) não encontrado.`);
    const tableHtml = buildProposalEmailTableHtml(letterDataFor(bundle));
    // {{engenheiro}} usa o(s) nome(s) real(is) atribuído(s) às PMs deste hospital; só cai
    // no genérico ("Equipa técnica"/"Equipo técnico") quando nenhuma PM tem engenheiro.
    const engenheiro =
      bundle.engineerNames.length > 0
        ? bundle.engineerNames.join(', ')
        : bundle.hospital.country === 'ES'
          ? 'Equipo técnico'
          : 'Equipa técnica';
    // A proposta é criada ANTES do envio (e não depois, como estava): é dela que sai o
    // reference_code que vai no assunto da carta, e é por esse código que a resposta do
    // cliente com o documento assinado é reconhecida. Se o envio falhar fica uma proposta
    // em 'draft', que é o estado em que já estaria.
    const proposal = await getOrCreateProposal(bundle.hospital.id, planningYear, bundle.track);

    const rendered = renderProposalEmail(
      template,
      { ano: String(planningYear), hospital: bundle.hospital.name, engenheiro },
      tableHtml,
    );
    const htmlBody = rendered.htmlBody;
    // Só a carta de assinatura leva o código: é a única a que se espera resposta com
    // documento anexado. O código já traz o prefixo da via ("PM-"/"BT-", trigger da 0017),
    // por isso a resposta é arquivada na proposta certa e não apenas no hospital certo.
    const isSignatureLetter = step === 'signature_letter';
    const subject = isSignatureLetter
      ? withReferenceCode(rendered.subject, proposal.reference_code)
      : rendered.subject;
    // CC = quem envia (sempre) + destinatários fixos activos (email_recipients, geridos na
    // app) + o Team Leader da zona, nos emails que vão para o cliente. Desactivar alguém na
    // tab "Destinatários em CC" tira-o daqui sem mexer no código.
    const fixedCc = recipients.filter((recipient) => recipient.active).map((recipient) => recipient.email);
    // O TL entra só nos envios ao cliente (proposta e carta de assinatura), que é onde a
    // regra se aplica — o email de validação ao engenheiro é interno e não passa por ele.
    // Quem for TL da zona *e* engenheiro das PMs não recebe duas vezes: o Set desduplica.
    const isClientEmail = step === 'client_proposal' || step === 'signature_letter';
    // O interruptor "Incluir os Team Leaders das zonas" (Aprovações → Destinatários em CC)
    // permite tirá-los do loop durante os testes, tal como o "Ativo" de cada pessoa.
    const teamLeaderCc =
      isClientEmail && includeTeamLeaders && bundle.teamLeader?.email ? [bundle.teamLeader.email] : [];
    // A caixa de documentos vai só em Reply-To, NUNCA em CC. Em CC, a nossa própria carta
    // era entregue à caixa e o webhook arquivava o PDF por assinar que acabáramos de
    // enviar — ficavam dois documentos por hospital, um deles inútil. O Reply-To sozinho
    // faz o trabalho todo: basta o cliente carregar em "Responder".
    const cc = [...new Set([...(profile?.email ? [profile.email] : []), ...fixedCc, ...teamLeaderCc])];
    // Reply-To da carta: a caixa de documentos (que arquiva), quem enviou, e os
    // destinatários fixos activos. Estes últimos estão aqui porque uma resposta do cliente
    // só chega a quem está em Reply-To — estar em CC do email que sai não faz receber a
    // resposta que entra, e a Teresa (contacto Elekta) tem de ver os documentos assinados
    // à medida que chegam, não só o pedido que os originou.
    const replyTo = isSignatureLetter
      ? [...new Set([...(profile?.email ? [profile.email] : []), ...fixedCc, SIGNED_DOCUMENTS_MAILBOX])]
      : undefined;

    const messageId = await sendProposalEmail({
      to,
      cc,
      ...(replyTo ? { replyTo } : {}),
      subject,
      html: htmlBody,
      attachments,
    });
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
      // Id devolvido pela Resend — estava a ser deitado fora. Guardado, dá para cruzar um
      // envio com o que se vê no painel da Resend quando algo corre mal.
      graphMessageId: messageId || null,
    });
    return proposal;
  }

  // Carta de assinatura (PDF) + calendário (.ics) como anexos reais — Resend suporta
  // anexos, ao contrário do mailto: usado antes. Partilhada pelo envio inicial e pelo
  // reenvio: ambos regeram os anexos a partir das PMs actuais, nunca de um snapshot, que
  // é o que faz o reenvio levar o plano actualizado.
  async function sendSignatureLetter(bundle: HospitalBundle) {
    if (bundle.clientEmails.length === 0) {
      throw new Error(`Sem contactos de email para ${bundle.hospital.name} — adiciona em Hospitais → Contactos.`);
    }
    const doc = await generateProposalLetterPdf(letterDataFor(bundle));
    const pdfBase64 = doc.output('datauristring').split(',')[1] ?? '';
    // A via entra no nome do ficheiro: um hospital com as duas cartas no mesmo ano recebe
    // dois anexos, e "Plano_Manutencao_X_2026.pdf" duas vezes é indistinguível na caixa de
    // correio de quem tem de os assinar.
    const baseName = `${trackFileTag(bundle.track)}${bundle.hospital.name.replace(/\s+/g, '_')}_${planningYear}`;
    const ics = buildProposalIcs(bundle.hospital.name, bundle.equipmentList, bundle.events);
    return sendTemplateEmail(bundle, 'signature_letter', bundle.clientEmails, [
      { filename: `Plano_Manutencao_${baseName}.pdf`, content: pdfBase64 },
      // charset=utf-8 explícito: sem ele o Resend/Outlook tratam o .ics como US-ASCII
      // e removem os acentos (ç, ã) e o travessão. method=PUBLISH espelha o do ficheiro.
      {
        filename: `PMs_${baseName}.ics`,
        content: utf8ToBase64(ics),
        contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
      },
    ]);
  }

  async function runAction(bundle: HospitalBundle, action: ActionKey) {
    setBusyKey(bundle.key);
    try {
      switch (action) {
        case 'send_engineer': {
          if (bundle.engineerEmails.length === 0) {
            throw new Error(`Sem email de engenheiro associado às PMs de ${bundleLabel(bundle)}.`);
          }
          const proposal = await sendTemplateEmail(bundle, 'engineer_approval', bundle.engineerEmails);
          await updateProposal(proposal.id, { stage: 'pending_engineer' });
          break;
        }
        case 'resend_engineer': {
          if (bundle.engineerEmails.length === 0) {
            throw new Error(`Sem email de engenheiro associado às PMs de ${bundleLabel(bundle)}.`);
          }
          await sendTemplateEmail(bundle, 'engineer_approval', bundle.engineerEmails);
          break;
        }
        case 'confirm_engineer': {
          const proposal = await getOrCreateProposal(bundle.hospital.id, planningYear, bundle.track);
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
          const proposal = await getOrCreateProposal(bundle.hospital.id, planningYear, bundle.track);
          await updateProposal(proposal.id, {
            stage: 'client_approved',
            client_approved_at: new Date().toISOString(),
            client_approved_by: profile?.id ?? null,
          });
          break;
        }
        case 'send_letter': {
          const proposal = await sendSignatureLetter(bundle);
          await updateProposal(proposal.id, {
            stage: 'letter_sent',
            letter_sent_at: new Date().toISOString(),
            letter_sent_to: bundle.clientEmails,
          });
          break;
        }
        case 'resend_letter': {
          // Mesmo envio do send_letter: a carta e o .ics são sempre regerados a partir das
          // PMs actuais (letterDataFor lê o bundle vivo), por isso o cliente recebe já o
          // plano alterado, não uma cópia do que foi enviado da primeira vez.
          const proposal = await sendSignatureLetter(bundle);
          // Volta a 'letter_sent' e limpa a assinatura: se já estava 'signed', a assinatura
          // que existia é de um plano que deixou de estar em vigor — deixá-la registada
          // daria a entender que o cliente aprovou as datas novas, que ainda não viu.
          await updateProposal(proposal.id, {
            stage: 'letter_sent',
            letter_sent_at: new Date().toISOString(),
            letter_sent_to: bundle.clientEmails,
            signed_at: null,
            signed_by: null,
          });
          break;
        }
        case 'confirm_signed': {
          const proposal = await getOrCreateProposal(bundle.hospital.id, planningYear, bundle.track);
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
        message: isSendAction ? `${bundleLabel(bundle)}: email enviado.` : `${bundleLabel(bundle)}: estado actualizado.`,
      });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha na acção.' });
    } finally {
      setBusyKey(null);
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
    downloadIcs(
      `PMs_${trackFileTag(bundle.track)}${bundle.hospital.name.replace(/\s+/g, '_')}_${planningYear}.ics`,
      ics,
    );
  }

  async function runBulkAction() {
    const selected = visibleBundles.filter((bundle) => selectedIds.has(bundle.key));
    for (const bundle of selected) {
      const action = nextAction(bundle.proposal?.stage ?? 'draft');
      if (action) await runAction(bundle, action.key);
    }
  }

  // Reinicia o workflow desta via: volta a 'draft' e limpa todas as confirmações/envios já
  // registados (engenheiro, cliente, carta, assinatura). Usado quando as datas mudam depois
  // de já ter arrancado o processo — obriga a revalidar tudo de novo. Só a via em questão é
  // reiniciada: a outra segue o seu caminho, que é a razão de existirem em separado.
  async function runReset(bundle: HospitalBundle) {
    if (!bundle.proposal) {
      setResetTarget(null);
      return;
    }
    setBusyKey(bundle.key);
    try {
      await updateProposal(bundle.proposal.id, {
        stage: 'draft',
        engineer_approved_at: null,
        engineer_approved_by: null,
        client_approved_at: null,
        client_approved_by: null,
        letter_sent_at: null,
        letter_sent_to: null,
        signed_at: null,
        signed_by: null,
        rejected_reason: null,
      });
      pushToast({ variant: 'success', message: `${bundleLabel(bundle)}: workflow reiniciado.` });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao reiniciar.' });
    } finally {
      setBusyKey(null);
      setResetTarget(null);
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

  // "Todos" refere-se ao que está à vista: com o filtro de via activo, seleccionar tudo não
  // pode arrastar linhas que o utilizador não está sequer a ver.
  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === visibleBundles.length ? new Set() : new Set(visibleBundles.map((bundle) => bundle.key)),
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-1 text-lg font-semibold text-gray-900">Aprovações — Envio de Propostas a Clientes</h1>
        <p className="mb-4 text-sm text-gray-500">
          Ano de planeamento {planningYear}. Cada linha é um processo independente — confirma com o engenheiro,
          envia a proposta ao cliente e, depois de aprovada, envia a carta de assinatura. Os equipamentos de{' '}
          <strong>Braquiterapia</strong> têm a sua própria linha: são validados, aprovados e assinados à parte do
          resto do hospital. A via de cada modalidade define-se em Equipamentos → Editar modalidades.
        </p>

        {/* Separadores: o workflow de aprovações e a edição dos templates de email vivem
            em tabs distintos — os templates são configuração, não fazem parte do dia-a-dia
            do envio. */}
        <div className="mb-4 flex gap-1 border-b border-gray-200">
          {([
            { key: 'approvals', label: 'Aprovações' },
            { key: 'templates', label: 'Templates das aprovações' },
            { key: 'recipients', label: 'Destinatários em CC' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'templates' && canAct && <TemplateEditor />}
        {activeTab === 'templates' && !canAct && (
          <p className="rounded-md border border-gray-200 p-4 text-sm text-gray-500">
            Sem permissões para editar templates.
          </p>
        )}

        {activeTab === 'recipients' && canAct && <EmailRecipientsEditor />}
        {activeTab === 'recipients' && !canAct && (
          <p className="rounded-md border border-gray-200 p-4 text-sm text-gray-500">
            Sem permissões para gerir destinatários.
          </p>
        )}

        {activeTab === 'approvals' && bundles.length === 0 && (
          <p className="rounded-md border border-gray-200 p-4 text-sm text-gray-500">
            Sem PMs agendadas para {planningYear}.
          </p>
        )}

        {activeTab === 'approvals' && bundles.length > 0 && (
          <>
            {/* Filtro de via: com a braquiterapia à parte, a mesma lista passa a ter duas
                linhas por hospital — quem está a tratar de uma delas isola-a aqui. */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">Via:</span>
              {trackFilterOptions.map((option) => {
                const count =
                  option.key === 'all' ? bundles.length : bundles.filter((bundle) => bundle.track === option.key).length;
                return (
                  <button
                    key={option.key}
                    onClick={() => {
                      setTrackFilter(option.key);
                      // A selecção é por linha; ao mudar de filtro deixaria seleccionadas
                      // linhas escondidas, que o "Avançar seleccionados" ignoraria em
                      // silêncio. Limpa-se, que é o que o utilizador espera.
                      setSelectedIds(new Set());
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      trackFilter === option.key
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {option.label} ({count})
                  </button>
                );
              })}
            </div>

            {canAct && (
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm text-gray-600">{selectedIds.size} seleccionado(s)</span>
                <Button variant="secondary" onClick={runBulkAction} disabled={selectedIds.size === 0 || busyKey !== null}>
                  Avançar seleccionados
                </Button>
              </div>
            )}

            {visibleBundles.length === 0 && (
              <p className="rounded-md border border-gray-200 p-4 text-sm text-gray-500">
                Sem PMs agendadas nesta via para {planningYear}.
              </p>
            )}

            {visibleBundles.length > 0 && (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    {canAct && (
                      <th className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === visibleBundles.length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                    )}
                    <th className="py-1.5 pr-2">Hospital</th>
                    <th className="py-1.5 pr-2">Via</th>
                    <th className="py-1.5 pr-2">País</th>
                    <th className="py-1.5 pr-2">Team Leader</th>
                    <th className="py-1.5 pr-2">Equipamentos</th>
                    <th className="py-1.5 pr-2">Dias-PM</th>
                    <th className="py-1.5 pr-2">Estado</th>
                    <th className="py-1.5 pr-2" />
                  </tr>
                </thead>
                <tbody>
                  {visibleBundles.map((bundle) => (
                    <ApprovalRow
                      key={bundle.key}
                      bundle={bundle}
                      canAct={canAct}
                      selected={selectedIds.has(bundle.key)}
                      busy={busyKey === bundle.key}
                      includeTeamLeaders={includeTeamLeaders}
                      onToggleSelected={() => toggleSelected(bundle.key)}
                      onPreviewPdf={() => previewPdf(bundle)}
                      onDownloadCalendar={() => downloadCalendar(bundle)}
                      onRunAction={(action) => runAction(bundle, action)}
                      onConfirmResendLetter={() => setResendLetterTarget(bundle)}
                      onReset={() => setResetTarget(bundle)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {resendLetterTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Reenviar carta para assinatura</h2>
            <p className="mb-4 text-sm text-gray-600">
              Vai ser enviada a <strong>{bundleLabel(resendLetterTarget)}</strong> uma nova carta, gerada com as
              datas de PM que estão neste momento no calendário. Como a proposta já estava assinada, o estado volta
              a “Carta enviada” e <strong>a assinatura registada é apagada</strong> — a que existia refere-se ao
              plano anterior, e passa a ser preciso obter a assinatura da versão nova.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setResendLetterTarget(null)}
                disabled={busyKey === resendLetterTarget.key}
              >
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  const target = resendLetterTarget;
                  setResendLetterTarget(null);
                  await runAction(target, 'resend_letter');
                }}
                disabled={busyKey === resendLetterTarget.key}
              >
                Reenviar carta
              </Button>
            </div>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Reiniciar workflow de aprovações</h2>
            <p className="mb-4 text-sm text-gray-600">
              Quer mesmo reiniciar o processo de <strong>{bundleLabel(resetTarget)}</strong>? O estado volta a
              “Por enviar” e todas as confirmações já registadas (engenheiro, cliente, carta e assinatura) são
              apagadas — implica <strong>revalidar de novo com o engenheiro e com o cliente</strong>.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setResetTarget(null)}
                disabled={busyKey === resetTarget.key}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => runReset(resetTarget)}
                disabled={busyKey === resetTarget.key}
              >
                Sim, reiniciar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ApprovalRowProps {
  bundle: HospitalBundle;
  canAct: boolean;
  selected: boolean;
  busy: boolean;
  includeTeamLeaders: boolean;
  onToggleSelected: () => void;
  onPreviewPdf: () => void;
  onDownloadCalendar: () => void;
  onRunAction: (action: ActionKey) => void;
  onConfirmResendLetter: () => void;
  onReset: () => void;
}

// A linha vive num componente próprio, e não em linha na tabela, por duas razões: com as
// vias a lista passou a ter duas linhas por hospital e a linha ganhou estado próprio
// (selecção e "ocupado" por via, não por hospital); e o JSX da página tinha aninhamento
// suficiente para o esbuild rebentar a stack ao compilá-lo — mais um nível bastava para o
// `vite build` deixar de correr. Extrair a linha resolve as duas.
function ApprovalRow({
  bundle,
  canAct,
  selected,
  busy,
  includeTeamLeaders,
  onToggleSelected,
  onPreviewPdf,
  onDownloadCalendar,
  onRunAction,
  onConfirmResendLetter,
  onReset,
}: ApprovalRowProps) {
  const stage = bundle.proposal?.stage ?? 'draft';
  const action = nextAction(stage);
  const resend = resendAction(stage);

  return (
    <tr className="border-b border-gray-100">
      {canAct && (
        <td className="py-1.5 pr-2">
          <input type="checkbox" checked={selected} onChange={onToggleSelected} />
        </td>
      )}
      <td className="py-1.5 pr-2">{bundle.hospital.name}</td>
      {/* A via é a coluna que explica porque é que o mesmo hospital aparece duas vezes,
          em fases diferentes. */}
      <td className="py-1.5 pr-2">
        <span title={TRACK_COLUMN_TITLES[bundle.track]}>
          <Badge color={APPROVAL_TRACK_COLORS[bundle.track]}>{APPROVAL_TRACK_LABELS[bundle.track]}</Badge>
        </span>
      </td>
      <td className="py-1.5 pr-2">{bundle.hospital.country}</td>
      {/* Quem vai em CC nos emails ao cliente. Sem TL não é um erro que bloqueie o envio,
          mas tem de se ver antes de carregar em enviar — senão a falta só se nota quando
          alguém repara que não recebeu. */}
      <td className="py-1.5 pr-2">
        {bundle.teamLeader ? (
          // Com o interruptor desligado o nome fica riscado: mostrar quem é o TL sem
          // indicar que ele não vai receber seria enganador.
          <span
            className={includeTeamLeaders ? '' : 'text-gray-400 line-through'}
            title={
              includeTeamLeaders
                ? bundle.teamLeader.email
                : `${bundle.teamLeader.email} — desligado em "Destinatários em CC"; não entra em cópia.`
            }
          >
            {bundle.teamLeader.name}
          </span>
        ) : (
          <span
            className="text-red-600"
            title={`A zona "${bundle.hospital.zone_name}" não tem Team Leader — define-o em Configurações → Zonas.`}
          >
            Sem TL
          </span>
        )}
      </td>
      <td className="py-1.5 pr-2">{bundle.equipmentList.length}</td>
      <td className="py-1.5 pr-2">{bundle.events.length}</td>
      <td className="py-1.5 pr-2">
        <Badge color={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Badge>
      </td>
      <td className="py-1.5 pr-2 text-right">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onPreviewPdf}>
            Pré-visualizar PDF
          </Button>
          <Button variant="secondary" onClick={onDownloadCalendar}>
            Descarregar .ics
          </Button>
          {/* Reenviar a carta a um hospital já assinado passa primeiro pela confirmação —
              invalida a assinatura registada. Nos restantes reenvios não há nada a perder,
              vai directo. */}
          {canAct && resend && (
            <Button
              variant="secondary"
              onClick={() => (stage === 'signed' ? onConfirmResendLetter() : onRunAction(resend.key))}
              disabled={busy}
            >
              {resend.label}
            </Button>
          )}
          {canAct && action && (
            <Button onClick={() => onRunAction(action.key)} disabled={busy}>
              {action.label}
            </Button>
          )}
          {/* Reiniciar só faz sentido depois de o workflow ter arrancado (stage !== draft)
              — antes disso não há nada para revalidar. */}
          {canAct && stage !== 'draft' && (
            <Button variant="danger" onClick={onReset} disabled={busy}>
              Recomeçar
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
