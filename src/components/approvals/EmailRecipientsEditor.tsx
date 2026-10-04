import { useEffect, useState } from 'react';
import {
  SETTING_INCLUDE_TEAM_LEADERS,
  useAppSettingsStore,
  useAuthStore,
  useEmailRecipientStore,
  useUiStore,
} from '../../stores';
import { Button, Card, EmptyState } from '../ui';
import { SIGNED_DOCUMENTS_MAILBOX } from '../../lib/proposalEmail';
import { useT } from '../../i18n';

// Gestão dos destinatários que vão SEMPRE em CC nos envios de propostas/cartas aos
// clientes (substitui o antigo TERESA_EMAIL hardcoded). O toggle "Ativo" liga/desliga
// cada pessoa do loop de emails sem apagar o registo — é como se tira alguém dos envios
// durante os testes e se volta a pôr depois, sem deploy. Quem envia não entra
// automaticamente: quem quiser receber os envios acrescenta-se aqui. Os Team Leaders não
// estão na lista — vêm das zonas e têm o seu interruptor (app_settings).
export function EmailRecipientsEditor() {
  const t = useT();
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

  async function handleToggleSetting(key: string, value: boolean) {
    setBusy(true);
    try {
      await setBoolean(key, value, profile?.id ?? null);
    } catch {
      pushToast({ variant: 'error', message: t('recipients.settingFailed') });
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const email = newEmail.trim();
    if (!email || busy) return;
    // Validação leve — a coluna é unique, mas evita-se o round-trip para gralhas óbvias.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      pushToast({ variant: 'error', message: t('recipients.invalidEmail') });
      return;
    }
    setBusy(true);
    try {
      await createRecipient(email, newName);
      setNewEmail('');
      setNewName('');
    } catch (err) {
      const message =
        err instanceof Error && /duplicate|unique/i.test(err.message)
          ? t('recipients.duplicate')
          : t('recipients.addFailed');
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
      pushToast({ variant: 'error', message: t('recipients.updateFailed') });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      await deleteRecipient(id);
    } catch {
      pushToast({ variant: 'error', message: t('recipients.deleteFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl" title={t('recipients.title')}>
      <p className="mb-4 text-sm text-gray-500">
        {t('recipients.intro')} {t('recipients.repliesNote', { mailbox: SIGNED_DOCUMENTS_MAILBOX })}
      </p>

      {/* Os Team Leaders não estão na lista abaixo — vêm das zonas (Configurações →
          Zonas). Precisavam de um interruptor próprio para se poderem tirar do loop
          durante os testes, que é exactamente o que o "Ativo" faz a cada pessoa. */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={includeTeamLeaders}
            disabled={busy}
            onChange={(event) => handleToggleSetting(SETTING_INCLUDE_TEAM_LEADERS, event.target.checked)}
          />
          <span>
            <span className={`text-sm font-medium ${includeTeamLeaders ? 'text-gray-800' : 'text-gray-400'}`}>
              {t('recipients.includeTeamLeaders')}
            </span>
            <span className="block text-xs text-gray-500">{t('recipients.includeTeamLeadersHint')}</span>
          </span>
        </label>
      </div>

      <div className="mb-4 overflow-hidden rounded-lg border border-gray-200">
        {recipients.length === 0 && <EmptyState size="compact">{t('recipients.empty')}</EmptyState>}
        {recipients.map((recipient) => (
          <div
            key={recipient.id}
            className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-0"
          >
            <label className="flex cursor-pointer items-center gap-2" title={t('recipients.activeTitle')}>
              <input
                type="checkbox"
                checked={recipient.active}
                disabled={busy}
                onChange={(event) => handleToggle(recipient.id, event.target.checked)}
              />
              <span className={`text-xs ${recipient.active ? 'text-green-600' : 'text-gray-400'}`}>
                {recipient.active ? t('recipients.active') : t('recipients.inactive')}
              </span>
            </label>
            <div className="flex-1">
              <div className={`text-sm ${recipient.active ? 'text-gray-800' : 'text-gray-400'}`}>
                {recipient.name || recipient.email}
              </div>
              {recipient.name && <div className="text-xs text-gray-400">{recipient.email}</div>}
            </div>
            <Button variant="dangerGhost" size="sm" onClick={() => handleDelete(recipient.id)} disabled={busy}>
              {t('common.remove')}
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-gray-500">{t('common.email')}</label>
          <input
            placeholder={t('recipients.emailPlaceholder')}
            className="w-64 pm-field"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-gray-500">{t('recipients.nameOptional')}</label>
          <input
            placeholder={t('common.name')}
            className="w-48 pm-field"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
          />
        </div>
        <Button onClick={handleAdd} disabled={busy || !newEmail.trim()}>
          {t('common.add')}
        </Button>
      </div>
    </Card>
  );
}
