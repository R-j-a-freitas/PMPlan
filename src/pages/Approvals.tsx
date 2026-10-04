import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { useSearchParams } from 'react-router-dom';
import {
  EmailRecipientsEditor,
  OrphanSignedDocuments,
  SignedLetterLinks,
  TemplateEditor,
} from '../components/approvals';
import type { LetterDocument, OrphanDocumentRow } from '../components/approvals';
import { formatDocumentDateTime } from '../components/documents';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChip,
  Modal,
  PageHeader,
  SearchInput,
  SortableTh,
  Tabs,
} from '../components/ui';
import { matchesSearch } from '../lib/searchText';
import { useTableSort } from '../hooks';
import type { SortAccessors } from '../hooks';
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
  resolveApprovalTrack,
  templateKeyFor,
} from '../lib/approvalTrack';
import { useLang, useT, type TFunction, type TranslationKey } from '../i18n';
import { APPROVAL_TRACK_KEYS } from '../i18n/labels';
import { resolveZoneTeam, resolveZoneTeamLeaderId } from '../lib/zoneTree';
import {
  SETTING_INCLUDE_TEAM_LEADERS,
  useAppSettingsStore,
  useAuthStore,
  useCalendarStore,
  useContactStore,
  useEmailRecipientStore,
  useEngineerStore,
  useEquipmentStore,
  useHospitalStore,
  useModalityStore,
  useProposalStore,
  useSignedDocumentStore,
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
  SignedDocument,
} from '../types';

// btoa() só lida com Latin1 — o .ics tem acentuação (ex: "Manutenção"), por isso passa
// primeiro por encodeURIComponent/unescape para ficar seguro em UTF-8.
function utf8ToBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

// Os destinatários fixos em CC (ex.: a Teresa, contacto Elekta) já não estão hardcoded —
// vivem na tabela email_recipients e são geridos na app (tab "Destinatários em CC", ver
// EmailRecipientsEditor). O "From" só pode usar o domínio verificado na conta Resend
// (pmplan.net), por isso estas pessoas vão sempre em CC e não como remetente.
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
  /** Engenheiros activos atribuídos à zona do hospital — destinatários do
   *  "Enviar a equipa de zona", alternativa ao envio só aos engenheiros das PMs. */
  zoneTeam: Engineer[];
  /** Documento assinado mais recente devolvido pelo cliente para esta proposta — null
   *  enquanto não chegar nenhum. */
  signedDocument: SignedDocument | null;
  /** Coluna "Cartas assinadas": os PDFs desta proposta e os do hospital sem via chegados
   *  no ano de planeamento, mais recentes primeiro. */
  letterDocuments: LetterDocument[];
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
function bundleLabel(bundle: HospitalBundle, t: TFunction): string {
  return bundle.track === 'standard'
    ? bundle.hospital.name
    : t('approvals.bundleLabelWithTrack', {
        hospital: bundle.hospital.name,
        track: t(APPROVAL_TRACK_KEYS[bundle.track]),
      });
}

const TRACK_COLUMN_TITLE_KEYS: Record<ApprovalTrack, TranslationKey> = {
  standard: 'approvals.trackTitle.standard',
  brachytherapy: 'approvals.trackTitle.brachytherapy',
};

/** Ordem por que o processo avança — a ordenação da coluna "Estado" segue-a. */
const STAGE_ORDER: ProposalStage[] = [
  'draft',
  'pending_engineer',
  'engineer_approved',
  'pending_client',
  'client_approved',
  'letter_sent',
  'signed',
  'rejected',
];

const STAGE_LABEL_KEYS: Record<ProposalStage, TranslationKey> = {
  draft: 'stage.draft',
  pending_engineer: 'stage.pending_engineer',
  engineer_approved: 'stage.engineer_approved',
  pending_client: 'stage.pending_client',
  client_approved: 'stage.client_approved',
  letter_sent: 'stage.letter_sent',
  signed: 'stage.signed',
  rejected: 'stage.rejected',
};

type BundleSortKey =
  | 'hospital'
  | 'track'
  | 'country'
  | 'teamLeader'
  | 'equipmentCount'
  | 'pmDays'
  | 'stage';

// "Estado" ordena pela fase do processo (a ordem por que ele avança, de "Por enviar" a
// "Assinado") e não pelo rótulo — é a coluna que responde a "o que falta fazer". "Via"
// segue a ordem de APPROVAL_TRACKS, a mesma que o resto da app usa.
const BUNDLE_SORT: SortAccessors<HospitalBundle, BundleSortKey> = {
  hospital: (bundle) => bundle.hospital.name,
  track: (bundle) => APPROVAL_TRACKS.indexOf(bundle.track),
  country: (bundle) => bundle.hospital.country,
  teamLeader: (bundle) => bundle.teamLeader?.name ?? null,
  equipmentCount: (bundle) => bundle.equipmentList.length,
  pmDays: (bundle) => bundle.events.length,
  stage: (bundle) => STAGE_ORDER.indexOf(bundle.proposal?.stage ?? 'draft'),
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
  | 'send_zone_team'
  | 'resend_zone_team'
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
function resendAction(stage: ProposalStage): { key: ActionKey; labelKey: TranslationKey } | null {
  switch (stage) {
    case 'pending_engineer':
      return { key: 'resend_engineer', labelKey: 'approvals.action.resend_engineer' };
    case 'pending_client':
      return { key: 'resend_client', labelKey: 'approvals.action.resend_client' };
    case 'letter_sent':
      return { key: 'resend_letter', labelKey: 'approvals.action.resend_letter' };
    case 'signed':
      return { key: 'resend_letter', labelKey: 'approvals.action.resend_letter_updated' };
    default:
      return null;
  }
}

type BulkDraftAction = Extract<ActionKey, 'send_engineer' | 'send_zone_team'>;

function nextAction(stage: ProposalStage): { key: ActionKey; labelKey: TranslationKey } | null {
  switch (stage) {
    case 'draft':
      return { key: 'send_engineer', labelKey: 'approvals.action.send_engineer' };
    case 'pending_engineer':
      return { key: 'confirm_engineer', labelKey: 'approvals.action.confirm_engineer' };
    case 'engineer_approved':
      return { key: 'send_client', labelKey: 'approvals.action.send_client' };
    case 'pending_client':
      return { key: 'confirm_client', labelKey: 'approvals.action.confirm_client' };
    case 'client_approved':
      return { key: 'send_letter', labelKey: 'approvals.action.send_letter' };
    case 'letter_sent':
      return { key: 'confirm_signed', labelKey: 'approvals.action.confirm_signed' };
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
// Aprovações são exclusivas do admin (migração 0028 — nem a leitura está aberta aos
// outros papéis). O menu já esconde a página; esta barreira cobre o endereço directo, e
// fica num componente à parte para não montar os hooks e os pedidos do ecrã completo.
export function Approvals() {
  const t = useT();
  const canView = useAuthStore((state) => state.permissions.canApproveSchedule);
  if (!canView) {
    return (
      <PageShell>
        <PageHeader title={t('approvals.title')} />
        <Card>
          <EmptyState>{t('approvals.restricted')}</EmptyState>
        </Card>
      </PageShell>
    );
  }
  return <ApprovalsContent />;
}

function ApprovalsContent() {
  const t = useT();
  const canAct = useAuthStore((state) => state.permissions.canApproveSchedule || state.permissions.canSendEmails);
  const profile = useAuthStore((state) => state.profile);
  const planningYear = useCalendarStore((state) => state.planningYear);
  const yearEvents = useCalendarStore((state) => state.yearEvents);
  const fetchYearEvents = useCalendarStore((state) => state.fetchYearEvents);
  const hospitals = useHospitalStore((state) => state.hospitals);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  // Contactos do cliente: são os destinatários da proposta e da carta, e cada um responde
  // a uma via (ou às duas) — ver a montagem de clientEmails mais abaixo.
  const contacts = useContactStore((state) => state.contacts);
  const fetchContacts = useContactStore((state) => state.fetchContacts);
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
  // Documentos assinados devolvidos pelos clientes — a tabela "Cartas assinadas recebidas"
  // e o botão "Carta assinada" de cada linha. É a chegada de um destes que passa a
  // proposta a 'signed' (trigger da migração 0022), por isso a página escuta-os ao vivo.
  const signedDocuments = useSignedDocumentStore((state) => state.documents);
  const fetchSignedDocuments = useSignedDocumentStore((state) => state.fetchSignedDocuments);
  const subscribeToSignedDocuments = useSignedDocumentStore((state) => state.subscribeToChanges);
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
  // ?tab=orphans abre directamente a fila de documentos por associar — é para lá que
  // aponta o aviso da página de Hospitais.
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'approvals' | 'orphans' | 'templates' | 'recipients'>(() =>
    searchParams.get('tab') === 'orphans' ? 'orphans' : 'approvals',
  );
  const canAssignDocuments = useAuthStore((state) => state.permissions.canApproveSchedule);
  // Filtro de via: com dois processos por hospital a lista duplica de tamanho, e quem está
  // a tratar da braquiterapia quer ver só essas linhas.
  const [trackFilter, setTrackFilter] = useState<ApprovalTrack | 'all'>('all');
  const [searchText, setSearchText] = useState('');
  // Hospital cujo workflow o utilizador pediu para reiniciar — aberto o modal de
  // confirmação enquanto não for null (reiniciar implica revalidar engenheiro + cliente).
  const [resetTarget, setResetTarget] = useState<HospitalBundle | null>(null);
  // Idem para o reenvio da carta de um hospital já assinado: reenviar invalida a assinatura
  // que estava registada, por isso não é uma acção para disparar num clique distraído.
  const [resendLetterTarget, setResendLetterTarget] = useState<HospitalBundle | null>(null);

  useEffect(() => {
    fetchHospitals();
    fetchContacts();
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
    fetchContacts,
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

  // Quando o cliente responde com a carta assinada, o webhook arquiva o PDF e o trigger
  // fecha a proposta — recarregar as duas coisas faz a linha passar a "Assinado" no ecrã
  // de quem está a olhar, sem ter de refrescar a página.
  useEffect(() => {
    fetchSignedDocuments();
    return subscribeToSignedDocuments(() => fetchProposals(planningYear));
  }, [planningYear, fetchSignedDocuments, subscribeToSignedDocuments, fetchProposals]);

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
          // Destinatários do cliente PARA ESTA VIA. Um contacto sem via (o caso normal)
          // serve as duas; um contacto com via só entra na sua — em 13 hospitais da lista
          // do cliente quem valida a braquiterapia não é quem valida os aceleradores, e
          // antes da migração 0021 não havia onde guardar essa diferença: a carta da
          // braquiterapia seguia para o físico dos aceleradores e vice-versa. Contactos
          // desactivados ficam de fora sem serem apagados (ver hospital_contacts.active).
          const clientEmails = [
            ...new Set(
              contacts
                .filter(
                  (contact) =>
                    contact.hospital_id === hospital.id &&
                    contact.active &&
                    (contact.approval_track === null || contact.approval_track === track),
                )
                .map((contact) => contact.email)
                .filter((email): email is string => !!email),
            ),
          ];
          // TL da zona do hospital, ou o da zona-mãe mais próxima que tenha um (só é preciso
          // configurá-lo nas zonas de topo — ver resolveZoneTeamLeaderId).
          const teamLeaderId = resolveZoneTeamLeaderId(hospital.zone_id, zones);
          const teamLeader = engineers.find((engineer) => engineer.id === teamLeaderId) ?? null;
          // signedDocuments vem ordenado do mais recente para o mais antigo (store).
          const signedDocument = proposal
            ? (signedDocuments.find((document) => document.proposal_id === proposal.id) ?? null)
            : null;
          // Os da proposta são todos do ano por definição (a proposta é do ano). Os que só
          // têm hospital não têm ano próprio: contam os chegados no ano de planeamento, e
          // aparecem nas duas vias do hospital porque não se sabe de qual são.
          const letterDocuments: LetterDocument[] = signedDocuments.flatMap((document): LetterDocument[] => {
            if (proposal && document.proposal_id === proposal.id) return [{ document, withoutTrack: false }];
            const isHospitalLevel =
              document.hospital_id === hospital.id &&
              !document.proposal_id &&
              new Date(document.received_at).getFullYear() === planningYear;
            return isHospitalLevel ? [{ document, withoutTrack: true }] : [];
          });
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
            zoneTeam: resolveZoneTeam(hospital.zone_id, engineers),
            signedDocument,
            letterDocuments,
          };
        }),
      )
      .filter((bundle) => bundle.events.length > 0)
      .sort(
        (a, b) =>
          a.hospital.name.localeCompare(b.hospital.name) ||
          APPROVAL_TRACKS.indexOf(a.track) - APPROVAL_TRACKS.indexOf(b.track),
      );
  }, [hospitals, contacts, equipment, modalities, yearEvents, proposals, engineers, zones, signedDocuments, planningYear]);

  // Procura sobre o que se lê na linha: hospital, via, país, zona, TL e estado (pelos
  // rótulos no idioma da interface), mais os engenheiros das PMs. Aplica-se antes do filtro
  // de via, para as contagens das pastilhas dizerem quantas linhas a procura deixa em cada.
  const searchedBundles = useMemo(
    () =>
      bundles.filter((bundle) =>
        matchesSearch(searchText, [
          bundle.hospital.name,
          bundle.hospital.short_name,
          bundle.hospital.country,
          bundle.hospital.zone_name,
          t(APPROVAL_TRACK_KEYS[bundle.track]),
          bundle.teamLeader?.name,
          t(STAGE_LABEL_KEYS[bundle.proposal?.stage ?? 'draft']),
          ...bundle.engineerNames,
        ]),
      ),
    [bundles, searchText, t],
  );

  const filteredBundles = useMemo(
    () => (trackFilter === 'all' ? searchedBundles : searchedBundles.filter((bundle) => bundle.track === trackFilter)),
    [searchedBundles, trackFilter],
  );

  const { rows: visibleBundles, sortableProps } = useTableSort(filteredBundles, BUNDLE_SORT, 'hospital');

  // Fila manual: sem hospital, ou com hospital que tem cartas à espera de assinatura mas
  // sem se saber de qual delas é o documento (duas vias, ficheiro sem indício). Um
  // documento com hospital e sem proposta cuja carta já não está à espera não entra — é
  // arquivo da ficha do hospital, não trabalho por fazer.
  const orphanRows = useMemo<OrphanDocumentRow[]>(() => {
    const hospitalsAwaitingSignature = new Set(
      proposals.filter((proposal) => proposal.stage === 'letter_sent').map((proposal) => proposal.hospital_id),
    );
    return signedDocuments.flatMap((document): OrphanDocumentRow[] => {
      if (!document.hospital_id) return [{ document, kind: 'no_hospital' }];
      if (!document.proposal_id && hospitalsAwaitingSignature.has(document.hospital_id)) {
        return [{ document, kind: 'no_track' }];
      }
      return [];
    });
  }, [signedDocuments, proposals]);

  const trackFilterOptions: { key: ApprovalTrack | 'all'; label: string }[] = [
    { key: 'all', label: t('approvals.allTracks') },
    ...APPROVAL_TRACKS.map((track) => ({ key: track, label: t(APPROVAL_TRACK_KEYS[track]) })),
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
    /** Substitui o {{engenheiro}} — o envio à equipa de zona cumprimenta a equipa, não os
     *  engenheiros das PMs, que podem nem estar entre os destinatários. */
    greeting?: string,
  ) {
    // A via escolhe o template (a braquiterapia tem os seus, `brachy_*`), o país escolhe o
    // idioma — nunca uma única versão fixa (secção: "estes emails e cartas têm de ser em PT
    // ou ES conforme o cliente").
    const templateKey = templateKeyFor(bundle.track, step);
    const template = templates.find((item) => item.key === templateKey && item.country === bundle.hospital.country);
    if (!template) {
      throw new Error(t('approvals.templateMissing', { key: templateKey, country: bundle.hospital.country }));
    }
    const tableHtml = buildProposalEmailTableHtml(letterDataFor(bundle));
    // {{engenheiro}} usa o(s) nome(s) real(is) atribuído(s) às PMs deste hospital; só cai
    // no genérico ("Equipa técnica"/"Equipo técnico") quando nenhuma PM tem engenheiro.
    const engenheiro =
      greeting ??
      (bundle.engineerNames.length > 0
        ? bundle.engineerNames.join(', ')
        : bundle.hospital.country === 'ES'
          ? 'Equipo técnico'
          : 'Equipa técnica');
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
    // CC = destinatários fixos activos (email_recipients) + o Team Leader da zona. Quem
    // envia não entra sozinho: se quiser receber, acrescenta-se à lista em "Destinatários
    // em CC", como qualquer outra pessoa. Tira-se do loop no "Ativo" / no interruptor dos
    // TLs, sem mexer no código.
    const fixedCc = recipients.filter((recipient) => recipient.active).map((recipient) => recipient.email);
    // O TL acompanha o processo todo — validação dos engenheiros e da equipa da zona,
    // proposta e carta ao cliente, e os reenvios — até a carta assinada chegar (stage
    // 'signed', posto pelo trigger da 0022 quando o documento é arquivado). Antes só ia
    // nos envios ao cliente, e o TL não via a validação interna.
    const teamLeaderCc =
      includeTeamLeaders && proposal.stage !== 'signed' && bundle.teamLeader?.email ? [bundle.teamLeader.email] : [];
    // A caixa de documentos vai só em Reply-To, NUNCA em CC. Em CC, a nossa própria carta
    // era entregue à caixa e o webhook arquivava o PDF por assinar que acabáramos de
    // enviar — ficavam dois documentos por hospital, um deles inútil. O Reply-To sozinho
    // faz o trabalho todo: basta o cliente carregar em "Responder".
    // Quem já vai em Para não se repete em CC (ex: o TL que também é da equipa da zona,
    // ou quem envia sendo um dos engenheiros).
    const toLower = new Set(to.map((email) => email.toLowerCase()));
    const cc = [...new Set([...fixedCc, ...teamLeaderCc])].filter(
      (email) => !toLower.has(email.toLowerCase()),
    );
    // Reply-To da carta: a caixa de documentos (que arquiva) e os destinatários fixos
    // activos. Estes últimos estão aqui porque uma resposta do cliente
    // só chega a quem está em Reply-To — estar em CC do email que sai não faz receber a
    // resposta que entra, e a Teresa (contacto Elekta) tem de ver os documentos assinados
    // à medida que chegam, não só o pedido que os originou. O TL também, porque a carta
    // assinada é o fim do processo que ele acompanha.
    const replyTo = isSignatureLetter
      ? [...new Set([...fixedCc, ...teamLeaderCc, SIGNED_DOCUMENTS_MAILBOX])]
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
      throw new Error(t('approvals.noClientEmail', { hospital: bundle.hospital.name }));
    }
    const doc = await generateProposalLetterPdf(letterDataFor(bundle));
    const pdfBase64 = doc.output('datauristring').split(',')[1] ?? '';
    // A via entra no nome do ficheiro: um hospital com as duas cartas no mesmo ano recebe
    // dois anexos, e "Plano_Manutencao_X_2026.pdf" duas vezes é indistinguível na caixa de
    // correio de quem tem de os assinar.
    const baseName = `${trackFileTag(bundle.track)}${bundle.hospital.name.replace(/\s+/g, '_')}_${planningYear}`;
    const ics = buildProposalIcs(bundle.hospital.name, bundle.equipmentList, bundle.events);
    // O código da proposta vai também no nome do PDF: o cliente devolve normalmente o mesmo
    // ficheiro, assinado, e é por este código que cada documento é arquivado na sua via
    // (migração 0023) — mesmo que as duas cartas voltem no mesmo email, ou num email novo
    // sem o código no assunto. getOrCreateProposal é idempotente: sendTemplateEmail volta a
    // chamá-lo e recebe a mesma proposta.
    const proposal = await getOrCreateProposal(bundle.hospital.id, planningYear, bundle.track);
    return sendTemplateEmail(bundle, 'signature_letter', bundle.clientEmails, [
      { filename: `Plano_Manutencao_${baseName}_${proposal.reference_code}.pdf`, content: pdfBase64 },
      // charset=utf-8 explícito: sem ele o Resend/Outlook tratam o .ics como US-ASCII
      // e removem os acentos (ç, ã) e o travessão. method=PUBLISH espelha o do ficheiro.
      {
        filename: `PMs_${baseName}.ics`,
        content: utf8ToBase64(ics),
        contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
      },
    ]);
  }

  // Mesmo email de validação do "Enviar a engenheiro" (template engineer_approval, com a
  // tabela das PMs), mas para todos os engenheiros da zona do hospital. A saudação vai no
  // idioma do hospital — é o do template — e não no da interface de quem envia.
  async function sendToZoneTeam(bundle: HospitalBundle) {
    if (bundle.zoneTeam.length === 0) {
      throw new Error(t('approvals.noZoneTeam', { zone: bundle.hospital.zone_name }));
    }
    const greeting = `${bundle.hospital.country === 'ES' ? 'Equipo' : 'Equipa'} ${bundle.hospital.zone_name}`;
    const emails = [...new Set(bundle.zoneTeam.map((engineer) => engineer.email))];
    return sendTemplateEmail(bundle, 'engineer_approval', emails, undefined, greeting);
  }

  async function runAction(bundle: HospitalBundle, action: ActionKey) {
    setBusyKey(bundle.key);
    try {
      switch (action) {
        case 'send_engineer': {
          if (bundle.engineerEmails.length === 0) {
            throw new Error(t('approvals.noEngineerEmail', { bundle: bundleLabel(bundle, t) }));
          }
          const proposal = await sendTemplateEmail(bundle, 'engineer_approval', bundle.engineerEmails);
          await updateProposal(proposal.id, { stage: 'pending_engineer' });
          break;
        }
        case 'resend_engineer': {
          if (bundle.engineerEmails.length === 0) {
            throw new Error(t('approvals.noEngineerEmail', { bundle: bundleLabel(bundle, t) }));
          }
          await sendTemplateEmail(bundle, 'engineer_approval', bundle.engineerEmails);
          break;
        }
        // A validação pela equipa da zona é a mesma fase da validação pelo engenheiro:
        // avança para 'pending_engineer' e confirma-se com o mesmo "Marcar aprovado".
        case 'send_zone_team': {
          const proposal = await sendToZoneTeam(bundle);
          await updateProposal(proposal.id, { stage: 'pending_engineer' });
          break;
        }
        case 'resend_zone_team': {
          await sendToZoneTeam(bundle);
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
            throw new Error(t('approvals.noClientEmail', { hospital: bundle.hospital.name }));
          }
          const proposal = await sendTemplateEmail(bundle, 'client_proposal', bundle.clientEmails);
          await updateProposal(proposal.id, { stage: 'pending_client' });
          break;
        }
        case 'resend_client': {
          if (bundle.clientEmails.length === 0) {
            throw new Error(t('approvals.noClientEmail', { hospital: bundle.hospital.name }));
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
        message: isSendAction
          ? t('approvals.emailSent', { bundle: bundleLabel(bundle, t) })
          : t('approvals.stageUpdated', { bundle: bundleLabel(bundle, t) }),
      });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('approvals.actionFailed') });
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

  // As linhas em 'draft' têm dois caminhos (engenheiro das PMs ou equipa de zona); o
  // destino escolhido na barra aplica-se a todas elas. As restantes seguem o nextAction.
  async function runBulkAction(draftAction: BulkDraftAction) {
    const selected = visibleBundles.filter((bundle) => selectedIds.has(bundle.key));
    for (const bundle of selected) {
      const stage = bundle.proposal?.stage ?? 'draft';
      const actionKey = stage === 'draft' ? draftAction : nextAction(stage)?.key;
      if (actionKey) await runAction(bundle, actionKey);
    }
  }

  const selectedDraftCount = visibleBundles.filter(
    (bundle) => selectedIds.has(bundle.key) && (bundle.proposal?.stage ?? 'draft') === 'draft',
  ).length;

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
      pushToast({ variant: 'success', message: t('approvals.resetDone', { bundle: bundleLabel(bundle, t) }) });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('approvals.resetFailed') });
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
    <PageShell wide>
      <PageHeader
        title={t('approvals.title')}
        description={t('approvals.description', { year: planningYear })}
      />

      <div>
        {/* Separadores: o workflow de aprovações e a edição dos templates de email vivem
            em tabs distintos — os templates são configuração, não fazem parte do dia-a-dia
            do envio. */}
        <Tabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { key: 'approvals', label: t('approvals.tab.workflow') },
            {
              key: 'orphans',
              // Com a contagem à vista mesmo noutro separador: uma fila que só se vê
              // quando se entra nela é uma fila que fica esquecida.
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {t('approvals.tab.orphans')}
                  {orphanRows.length > 0 && (
                    <span className="rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                      {orphanRows.length}
                    </span>
                  )}
                </span>
              ),
            },
            { key: 'templates', label: t('approvals.tab.templates') },
            { key: 'recipients', label: t('approvals.tab.recipients') },
          ]}
        />

        {activeTab === 'orphans' && (
          <OrphanSignedDocuments
            rows={orphanRows}
            hospitals={hospitals}
            proposals={proposals}
            canManage={canAssignDocuments}
          />
        )}

        {activeTab === 'templates' && canAct && <TemplateEditor />}
        {activeTab === 'templates' && !canAct && (
          <Card>
            <EmptyState>{t('approvals.noTemplatePermission')}</EmptyState>
          </Card>
        )}

        {activeTab === 'recipients' && canAct && <EmailRecipientsEditor />}
        {activeTab === 'recipients' && !canAct && (
          <Card>
            <EmptyState>{t('approvals.noRecipientPermission')}</EmptyState>
          </Card>
        )}

        {activeTab === 'approvals' && bundles.length === 0 && (
          <Card>
            <EmptyState>{t('approvals.noPms', { year: planningYear })}</EmptyState>
          </Card>
        )}

        {activeTab === 'approvals' && bundles.length > 0 && (
          <>
            {/* Filtro de via + acção em lote numa barra só: são os dois controlos que
                actuam sobre a lista inteira, e pertencem juntos por cima dela. */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {/* Mesma regra do filtro de via: mudar a procura limpa a selecção, para o
                  "Avançar seleccionados" nunca mexer em linhas que deixaram de estar à vista. */}
              <SearchInput
                value={searchText}
                onChange={(value) => {
                  setSearchText(value);
                  setSelectedIds(new Set());
                }}
                placeholder={t('approvals.searchPlaceholder')}
                className="w-72"
              />
              <span className="ml-2 text-sm text-gray-600">{t('approvals.trackFilter')}</span>
              {trackFilterOptions.map((option) => {
                const count =
                  option.key === 'all'
                    ? searchedBundles.length
                    : searchedBundles.filter((bundle) => bundle.track === option.key).length;
                return (
                  <FilterChip
                    key={option.key}
                    active={trackFilter === option.key}
                    count={count}
                    onClick={() => {
                      setTrackFilter(option.key);
                      // A selecção é por linha; ao mudar de filtro deixaria seleccionadas
                      // linhas escondidas, que o "Avançar seleccionados" ignoraria em
                      // silêncio. Limpa-se, que é o que o utilizador espera.
                      setSelectedIds(new Set());
                    }}
                  >
                    {option.label}
                  </FilterChip>
                );
              })}

              {canAct && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {t('approvals.selectedCount', { count: selectedIds.size })}
                  </span>
                  {/* Com linhas por enviar na selecção há dois destinos possíveis para a
                      validação — mostram-se os dois, para se ver antes do clique para onde
                      vai. Sem elas, um só botão avança cada linha para a fase seguinte. */}
                  {selectedDraftCount > 0 ? (
                    <>
                      <Button
                        onClick={() => runBulkAction('send_engineer')}
                        disabled={busyKey !== null}
                        title={t('approvals.bulkDraftTitle', { count: selectedDraftCount })}
                      >
                        {t('approvals.advanceSelectedEngineer')}
                      </Button>
                      <Button
                        onClick={() => runBulkAction('send_zone_team')}
                        disabled={busyKey !== null}
                        title={t('approvals.bulkDraftTitle', { count: selectedDraftCount })}
                      >
                        {t('approvals.advanceSelectedZoneTeam')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() => runBulkAction('send_engineer')}
                      disabled={selectedIds.size === 0 || busyKey !== null}
                    >
                      {t('approvals.advanceSelected')}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {visibleBundles.length === 0 && (
              <Card>
                <EmptyState>
                  {searchText.trim()
                    ? t('approvals.noSearchResults', { search: searchText.trim() })
                    : t('approvals.noPmsInTrack', { year: planningYear })}
                </EmptyState>
              </Card>
            )}

            {visibleBundles.length > 0 && (
              <Card padded={false}>
              <div className="overflow-x-auto">
              <table className="pm-table">
                <thead>
                  <tr>
                    {canAct && (
                      <th className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === visibleBundles.length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                    )}
                    <SortableTh {...sortableProps('hospital')}>{t('common.hospital')}</SortableTh>
                    <SortableTh {...sortableProps('track')}>{t('approvals.col.track')}</SortableTh>
                    <SortableTh {...sortableProps('country')}>{t('common.country')}</SortableTh>
                    <SortableTh {...sortableProps('teamLeader')}>{t('approvals.col.teamLeader')}</SortableTh>
                    <SortableTh {...sortableProps('equipmentCount')}>{t('common.equipmentPlural')}</SortableTh>
                    <SortableTh {...sortableProps('pmDays')}>{t('approvals.col.pmDays')}</SortableTh>
                    <SortableTh {...sortableProps('stage')}>{t('common.status')}</SortableTh>
                    <th className="py-1.5 pr-2">{t('approvals.col.signedLetters')}</th>
                    <th className="py-1.5 pr-2" />
                  </tr>
                </thead>
                <tbody>
                  {visibleBundles.map((bundle) => (
                    <ApprovalRow
                      key={bundle.key}
                      t={t}
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
              </div>
              </Card>
            )}
          </>
        )}
      </div>

      {resendLetterTarget && (
        <Modal
          title={t('approvals.resendLetterTitle')}
          onClose={() => setResendLetterTarget(null)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setResendLetterTarget(null)}
                disabled={busyKey === resendLetterTarget.key}
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={async () => {
                  const target = resendLetterTarget;
                  setResendLetterTarget(null);
                  await runAction(target, 'resend_letter');
                }}
                disabled={busyKey === resendLetterTarget.key}
              >
                {t('approvals.resendLetterConfirm')}
              </Button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            {t('approvals.resendLetterBody', { bundle: bundleLabel(resendLetterTarget, t) })}
          </p>
        </Modal>
      )}

      {resetTarget && (
        <Modal
          title={t('approvals.resetTitle')}
          onClose={() => setResetTarget(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setResetTarget(null)} disabled={busyKey === resetTarget.key}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" onClick={() => runReset(resetTarget)} disabled={busyKey === resetTarget.key}>
                {t('approvals.resetConfirm')}
              </Button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            {t('approvals.resetBody', { bundle: bundleLabel(resetTarget, t) })}
          </p>
        </Modal>
      )}
    </PageShell>
  );
}

interface ApprovalRowProps {
  t: TFunction;
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
  t,
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
  const lang = useLang();
  const stage = bundle.proposal?.stage ?? 'draft';
  const action = nextAction(stage);
  const resend = resendAction(stage);
  const { signedDocument } = bundle;
  // Assinatura registada pelo trigger (0022) e não por alguém em "Marcar como assinado":
  // sem signed_by, com o documento na proposta.
  const signedAutomatically = stage === 'signed' && !bundle.proposal?.signed_by && !!signedDocument;
  // A equipa de zona é uma alternativa ao envio ao(s) engenheiro(s) das PMs, nas mesmas
  // fases: envio inicial em 'draft', reenvio enquanto se aguarda a validação.
  const zoneTeamAction: { key: ActionKey; labelKey: TranslationKey } | null =
    stage === 'draft'
      ? { key: 'send_zone_team', labelKey: 'approvals.action.send_zone_team' }
      : stage === 'pending_engineer'
        ? { key: 'resend_zone_team', labelKey: 'approvals.action.resend_zone_team' }
        : null;
  const zoneTeamTitle =
    bundle.zoneTeam.length > 0
      ? t('approvals.zoneTeamTitle', {
          zone: bundle.hospital.zone_name,
          names: bundle.zoneTeam.map((engineer) => engineer.name).join(', '),
        })
      : t('approvals.noZoneTeam', { zone: bundle.hospital.zone_name });

  return (
    <tr>
      {canAct && (
        <td className="py-1.5 pr-2">
          <input type="checkbox" checked={selected} onChange={onToggleSelected} />
        </td>
      )}
      <td className="py-1.5 pr-2">{bundle.hospital.name}</td>
      {/* A via é a coluna que explica porque é que o mesmo hospital aparece duas vezes,
          em fases diferentes. */}
      <td className="py-1.5 pr-2">
        <span title={t(TRACK_COLUMN_TITLE_KEYS[bundle.track])}>
          <Badge color={APPROVAL_TRACK_COLORS[bundle.track]}>{t(APPROVAL_TRACK_KEYS[bundle.track])}</Badge>
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
                : t('approvals.teamLeaderOff', { email: bundle.teamLeader.email })
            }
          >
            {bundle.teamLeader.name}
          </span>
        ) : (
          <span
            className="text-red-600"
            title={t('approvals.noTeamLeaderTitle', { zone: bundle.hospital.zone_name })}
          >
            {t('approvals.noTeamLeader')}
          </span>
        )}
      </td>
      <td className="py-1.5 pr-2">{bundle.equipmentList.length}</td>
      <td className="py-1.5 pr-2">{bundle.events.length}</td>
      <td className="py-1.5 pr-2">
        <span
          title={
            signedAutomatically
              ? t('approvals.signedAutomatically', {
                  date: formatDocumentDateTime(signedDocument!.received_at, lang),
                })
              : undefined
          }
        >
          <Badge color={STAGE_COLORS[stage]}>{t(STAGE_LABEL_KEYS[stage])}</Badge>
        </span>
      </td>
      <td className="py-1.5 pr-2">
        <SignedLetterLinks documents={bundle.letterDocuments} />
      </td>
      <td className="py-1.5 pr-2 text-right">
        {/* Cinco acções na mesma linha: as consultivas em ghost (não são o trabalho, são
            a verificação antes dele), a que faz avançar o processo em primary, e o
            recomeço em vermelho discreto no fim. É a política de botões aplicada ao caso
            mais denso da app. */}
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={onPreviewPdf} title={t('approvals.previewPdfTitle')}>
            PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={onDownloadCalendar} title={t('approvals.downloadIcsTitle')}>
            .ics
          </Button>
          {/* Reenviar a carta a um hospital já assinado passa primeiro pela confirmação —
              invalida a assinatura registada. Nos restantes reenvios não há nada a perder,
              vai directo. */}
          {canAct && resend && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => (stage === 'signed' ? onConfirmResendLetter() : onRunAction(resend.key))}
              disabled={busy}
            >
              {t(resend.labelKey)}
            </Button>
          )}
          {canAct && action && (
            <Button size="sm" onClick={() => onRunAction(action.key)} disabled={busy}>
              {busy ? t('approvals.processing') : t(action.labelKey)}
            </Button>
          )}
          {/* Desactivado quando a zona não tem equipa, com o motivo no title — melhor do
              que deixar carregar e só então dizer que não havia a quem enviar. */}
          {canAct && zoneTeamAction && (
            <Button
              size="sm"
              variant={stage === 'draft' ? 'primary' : 'secondary'}
              onClick={() => onRunAction(zoneTeamAction.key)}
              disabled={busy || bundle.zoneTeam.length === 0}
              title={zoneTeamTitle}
            >
              {t(zoneTeamAction.labelKey)}
            </Button>
          )}
          {/* Reiniciar só faz sentido depois de o workflow ter arrancado (stage !== draft)
              — antes disso não há nada para revalidar. */}
          {canAct && stage !== 'draft' && (
            <Button variant="dangerGhost" size="sm" onClick={onReset} disabled={busy}>
              {t('approvals.restart')}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
