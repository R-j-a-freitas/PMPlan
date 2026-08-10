import { useEffect, useState } from 'react';
import {
  SETTING_INCLUDE_TEAM_LEADERS,
  useAppSettingsStore,
  useAuthStore,
  useEmailRecipientStore,
  useUiStore,
} from '../../stores';
import { Button } from '../ui';

// Gestão dos destinatários que vão SEMPRE em CC nos envios de propostas/cartas aos
// clientes (substitui o antigo TERESA_EMAIL hardcoded). O toggle "Ativo" liga/desliga
// cada pessoa do loop de emails sem apagar o registo — é como se tira alguém dos envios
// durante os testes e se volta a pôr depois, sem deploy. O próprio utilizador que envia
// entra automaticamente em CC (não precisa de estar aqui).
export function EmailRecipientsEditor() {
  const recipients = useEmailRecipientStore((state) => state.recipients);
  const fetchRecipients = useEmailRecipientStore((state) => state.fetchRecipients);
  const createRecipient = useEmailRecipientStore((state) => state.createRecipient);
  const setActive = useEmailRecipientStore((state) => state.setActive);
  const deleteRecipient = useEmailRecipientStore((state) => state.deleteRecipient);
  const profile = useAuthStore((state) => state.profile);
  const pushToast = useUiStore((state) => state.pushToast);
  const fetchAppSettings = useAppSettingsStore((state) => state.fetchAppSettings);
  const setBoolean = useAppSettingsStore((state) => state.setBoolean);
  // Subscrever `settings` (e não só o getter) para o componente rerenderizar quando o
  // valor muda — getBoolean lê do estado, mas por si só não cria dependência.
  const settings = useAppSettingsStore((state) => state.settings);
  const includeTeamLeaders = typeof settings[SETTING_INCLUDE_TEAM_LEADERS] === 'boolean'
    ? (settings[SETTING_INCLUDE_TEAM_LEADERS] as boolean)
    : true;

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchRecipients();
    fetchAppSettings();
  }, [fetchRecipients, fetchAppSettings]);

  async function handleToggleTeamLeaders(value: boolean) {
    setBusy(true);
    try {
      await setBoolean(SETTING_INCLUDE_TEAM_LEADERS, value, profile?.id ?? null);
    } catch {
      pushToast({ variant: 'error', message: 'Falha ao actualizar a definição.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const email = newEmail.trim();
    if (!email || busy) return;
    // Validação leve — a coluna é unique, mas evita-se o round-trip para gralhas óbvias.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      pushToast({ variant: 'error', message: 'Email inválido.' });
      return;
    }
    setBusy(true);
    try {
      await createRecipient(email, newName);
      setNewEmail('');
      setNewName('');
    } catch (err) {
      const message = err instanceof Error && /duplicate|unique/i.test(err.message) ? 'Esse email já está na lista.' : 'Falha ao adicionar destinatário.';
      pushToast({ variant: 'error', message });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    setBusy(true);
    try {
      await setActive(id, active);
    } catch {
      pushToast({ variant: 'error', message: 'Falha ao actualizar destinatário.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      await deleteRecipient(id);
    } catch {
      pushToast({ variant: 'error', message: 'Falha ao remover destinatário.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="mb-1 text-base font-semibold text-gray-900">Destinatários em CC</h2>
      <p className="mb-4 text-sm text-gray-500">
        Estas pessoas entram em CC em todos os envios de propostas e cartas aos clientes. Desliga o interruptor{' '}
        <span className="font-medium">Ativo</span> para tirar alguém do loop (ex.: durante testes) sem apagar o registo —
        volta a ligar quando quiseres. {profile?.email && (
          <>
            O utilizador que envia ({profile.email}) entra sempre em CC automaticamente.
          </>
        )}{' '}
        Estas pessoas recebem também as <span className="font-medium">respostas dos clientes</span> com os documentos
        assinados (entram em Reply-To da carta de assinatura, a par de{' '}
        <span className="font-mono text-xs">documentos@stockmate.pt</span>).
      </p>

      {/* Os Team Leaders não estão na lista abaixo — vêm das zonas (Configurações →
          Zonas). Precisavam de um interruptor próprio para se poderem tirar do loop
          durante os testes, que é exactamente o que o "Ativo" faz a cada pessoa. */}
      <div className="mb-4 rounded-md border border-gray-200 p-3">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={includeTeamLeaders}
            disabled={busy}
            onChange={(event) => handleToggleTeamLeaders(event.target.checked)}
          />
          <span>
            <span className={`text-sm font-medium ${includeTeamLeaders ? 'text-gray-800' : 'text-gray-400'}`}>
              Incluir os Team Leaders das zonas
            </span>
            <span className="block text-xs text-gray-500">
              O TL da zona de cada cliente entra em CC nos emails que lhe são enviados. Desliga durante os testes
              para não incomodar os TLs — os envios continuam a funcionar, apenas sem eles em cópia.
            </span>
          </span>
        </label>
      </div>

      <div className="mb-4 overflow-hidden rounded-md border border-gray-200">
        {recipients.length === 0 && <p className="p-3 text-sm text-gray-500">Sem destinatários configurados.</p>}
        {recipients.map((recipient) => (
          <div
            key={recipient.id}
            className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-0"
          >
            <label className="flex cursor-pointer items-center gap-2" title="Ativo — recebe os emails">
              <input
                type="checkbox"
                checked={recipient.active}
                disabled={busy}
                onChange={(event) => handleToggle(recipient.id, event.target.checked)}
              />
              <span className={`text-xs ${recipient.active ? 'text-green-600' : 'text-gray-400'}`}>
                {recipient.active ? 'Ativo' : 'Inativo'}
              </span>
            </label>
            <div className="flex-1">
              <div className={`text-sm ${recipient.active ? 'text-gray-800' : 'text-gray-400'}`}>
                {recipient.name || recipient.email}
              </div>
              {recipient.name && <div className="text-xs text-gray-400">{recipient.email}</div>}
            </div>
            <Button variant="danger" onClick={() => handleDelete(recipient.id)} disabled={busy}>
              Remover
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-gray-500">Email</label>
          <input
            placeholder="pessoa@empresa.com"
            className="w-64 rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-gray-500">Nome (opcional)</label>
          <input
            placeholder="Nome"
            className="w-48 rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
          />
        </div>
        <Button variant="secondary" onClick={handleAdd} disabled={busy || !newEmail.trim()}>
          Adicionar
        </Button>
      </div>
    </div>
  );
}
