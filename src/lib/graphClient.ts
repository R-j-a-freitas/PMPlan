import { PublicClientApplication } from '@azure/msal-browser';
import type { Configuration } from '@azure/msal-browser';
import type { EquipmentFull, Hospital, PMEvent } from '../types';

const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_MSAL_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_APP_URL,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Scopes necessários: Calendars.ReadWrite, User.Read, offline_access
export const GRAPH_SCOPES = ['Calendars.ReadWrite', 'User.Read', 'offline_access'];

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

export async function loginMicrosoft(): Promise<void> {
  const result = await msalInstance.loginPopup({ scopes: GRAPH_SCOPES });
  msalInstance.setActiveAccount(result.account);
}

async function getAccessToken(): Promise<string> {
  const account = msalInstance.getActiveAccount();
  if (!account) {
    throw new Error('Sem sessão Microsoft activa — chame loginMicrosoft() primeiro.');
  }
  const result = await msalInstance.acquireTokenSilent({ scopes: GRAPH_SCOPES, account });
  return result.accessToken;
}

export function generatePMEmailBody(pm: PMEvent, equipment: EquipmentFull): string {
  return `
    <p><strong>Manutenção Preventiva agendada</strong></p>
    <ul>
      <li>Equipamento: ${equipment.name} (${equipment.model ?? '—'})</li>
      <li>Hospital: ${equipment.hospital_name}</li>
      <li>Início: ${pm.start_date}</li>
      <li>Fim: ${pm.end_date}</li>
      ${pm.notes ? `<li>Notas: ${pm.notes}</li>` : ''}
    </ul>
  `.trim();
}

interface OutlookEventPayload {
  subject: string;
  body: { contentType: 'HTML'; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location: { displayName: string };
  webLink: string;
}

function buildOutlookEventPayload(
  pm: PMEvent,
  equipment: EquipmentFull,
  hospital: Pick<Hospital, 'name'>,
): OutlookEventPayload {
  return {
    subject: `PM — ${equipment.name} (${equipment.model ?? ''})`,
    body: { contentType: 'HTML', content: generatePMEmailBody(pm, equipment) },
    start: { dateTime: pm.start_date, timeZone: 'Europe/Lisbon' },
    end: { dateTime: pm.end_date, timeZone: 'Europe/Lisbon' },
    location: { displayName: hospital.name },
    // Deep link de volta à aplicação:
    webLink: `${import.meta.env.VITE_APP_URL}/pm/${pm.id}`,
  };
}

// Fluxo de sincronização passo 1: PM aprovada no sistema → criar evento no Outlook do engenheiro
export async function createOutlookEvent(
  pm: PMEvent,
  equipment: EquipmentFull,
  hospital: Pick<Hospital, 'name'>,
): Promise<string> {
  const token = await getAccessToken();
  const response = await fetch(`${GRAPH_BASE_URL}/me/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildOutlookEventPayload(pm, equipment, hospital)),
  });
  if (!response.ok) throw new Error(`Falha ao criar evento no Outlook (${response.status}).`);
  const created = (await response.json()) as { id: string };
  return created.id;
}

export async function updateOutlookEvent(
  outlookEventId: string,
  pm: PMEvent,
  equipment: EquipmentFull,
  hospital: Pick<Hospital, 'name'>,
): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(`${GRAPH_BASE_URL}/me/events/${outlookEventId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildOutlookEventPayload(pm, equipment, hospital)),
  });
  if (!response.ok) throw new Error(`Falha ao actualizar evento no Outlook (${response.status}).`);
}

export async function deleteOutlookEvent(outlookEventId: string): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(`${GRAPH_BASE_URL}/me/events/${outlookEventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Falha ao remover evento no Outlook (${response.status}).`);
  }
}

export interface OutlookBusySlot {
  start: string;
  end: string;
  status: 'busy' | 'tentative' | 'oof' | 'workingElsewhere';
}

// Fluxo de sincronização passo 3: indisponibilidade no Outlook → conflictRules verifica antes do drop.
// Consumido por useOutlookSync / useConflictEngine (checkEngineerUnavailable fica a cargo do hook,
// que cruza estes slots com a data proposta).
export async function getEngineerAvailability(
  engineerEmail: string,
  startDateTime: string,
  endDateTime: string,
): Promise<OutlookBusySlot[]> {
  const token = await getAccessToken();
  const response = await fetch(`${GRAPH_BASE_URL}/me/calendar/getSchedule`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schedules: [engineerEmail],
      startTime: { dateTime: startDateTime, timeZone: 'Europe/Lisbon' },
      endTime: { dateTime: endDateTime, timeZone: 'Europe/Lisbon' },
      availabilityViewInterval: 60,
    }),
  });
  if (!response.ok) throw new Error(`Falha ao consultar disponibilidade (${response.status}).`);
  const data = (await response.json()) as { value: { scheduleItems: OutlookBusySlot[] }[] };
  return data.value[0]?.scheduleItems ?? [];
}
