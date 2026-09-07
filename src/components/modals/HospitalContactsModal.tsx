import { useEffect, useMemo, useState } from 'react';
import { useContactStore, useUiStore } from '../../stores';
import type { ApprovalTrack } from '../../types';
import { Badge, Button, EmptyState, Modal } from '../ui';
import { APPROVAL_TRACK_KEYS } from '../../i18n/labels';
import { useT } from '../../i18n';

interface HospitalContactsModalProps {
  hospitalId: string;
  hospitalName: string;
  onClose: () => void;
}

interface DraftContact {
  name: string;
  role: string;
  email: string;
  phone: string;
  /** '' = as duas vias. */
  track: ApprovalTrack | '';
}

const EMPTY_DRAFT: DraftContact = { name: '', role: '', email: '', phone: '', track: '' };

// Contactos do hospital — usados como destinatários das propostas de calendarização e da
// carta de assinatura (página Aprovações).
//
// Desde a migração 0021 vivem na tabela `hospital_contacts` e cada operação vai
// directamente à base de dados. Antes acumulavam-se num array local que só era gravado no
// fim, reescrevendo o jsonb inteiro do hospital: quem gravasse em segundo lugar apagava as
// alterações do primeiro. Por isso não há aqui botão "Guardar" — o que se faz, fica feito.
export function HospitalContactsModal({ hospitalId, hospitalName, onClose }: HospitalContactsModalProps) {
  const t = useT();
  const contacts = useContactStore((state) => state.contacts);
  const fetchContacts = useContactStore((state) => state.fetchContacts);
  const createContact = useContactStore((state) => state.createContact);
  const deleteContact = useContactStore((state) => state.deleteContact);
  const pushToast = useUiStore((state) => state.pushToast);
  const [draft, setDraft] = useState<DraftContact>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const rows = useMemo(
    () => contacts.filter((contact) => contact.hospital_id === hospitalId),
    [contacts, hospitalId],
  );

  async function addContact() {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await createContact({
        hospital_id: hospitalId,
        name: draft.name.trim(),
        role: draft.role.trim() || null,
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        mobile: null,
        fax: null,
        approval_track: draft.track === '' ? null : draft.track,
        notes: null,
      });
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('hospitalContacts.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function removeContact(id: string, name: string) {
    if (!window.confirm(t('contacts.confirmDelete', { name, hospital: hospitalName }))) return;
    setSaving(true);
    try {
      await deleteContact(id);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('contacts.deleteFailed') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={t('hospitalContacts.title', { hospital: hospitalName })}
      size="md"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="mb-4 max-h-52 overflow-y-auto rounded-lg border border-gray-200">
        {rows.length === 0 && <EmptyState size="compact">{t('hospitalContacts.empty')}</EmptyState>}
        {rows.map((contact) => (
          <div
            key={contact.id}
            className={`flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-0 ${
              contact.active ? '' : 'opacity-60'
            }`}
          >
            <div className="min-w-0 flex-1">
              <span className="font-medium text-gray-800">{contact.name}</span>
              {contact.role && <span className="text-xs text-gray-400"> — {contact.role}</span>}
              {contact.approval_track && (
                <>
                  {' '}
                  <Badge tone={contact.approval_track === 'brachytherapy' ? 'accent' : 'neutral'} size="sm">
                    {t(APPROVAL_TRACK_KEYS[contact.approval_track])}
                  </Badge>
                </>
              )}
              {!contact.active && (
                <>
                  {' '}
                  <Badge tone="warning" size="sm">
                    {t('contacts.badge.inactive')}
                  </Badge>
                </>
              )}
              <div className="truncate text-xs text-gray-500">
                {contact.email ?? '—'} {contact.phone && `· ${contact.phone}`}
              </div>
            </div>
            <Button variant="dangerGhost" size="sm" onClick={() => removeContact(contact.id, contact.name)} disabled={saving}>
              {t('common.remove')}
            </Button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder={t('common.name')}
          className="pm-field"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <input
          placeholder={t('hospitalContacts.rolePlaceholder')}
          className="pm-field"
          value={draft.role}
          onChange={(event) => setDraft({ ...draft, role: event.target.value })}
        />
        <input
          type="email"
          placeholder={t('common.email')}
          className="pm-field"
          value={draft.email}
          onChange={(event) => setDraft({ ...draft, email: event.target.value })}
        />
        <input
          placeholder={t('common.phone')}
          className="pm-field"
          value={draft.phone}
          onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
        />
        <select
          className="col-span-2 pm-field"
          value={draft.track}
          onChange={(event) => setDraft({ ...draft, track: event.target.value as ApprovalTrack | '' })}
        >
          <option value="">{t('contacts.track.both')}</option>
          <option value="standard">{t(APPROVAL_TRACK_KEYS.standard)}</option>
          <option value="brachytherapy">{t(APPROVAL_TRACK_KEYS.brachytherapy)}</option>
        </select>
        <Button
          variant="secondary"
          className="col-span-2"
          onClick={addContact}
          disabled={saving || !draft.name.trim()}
        >
          {t('hospitalContacts.add')}
        </Button>
      </div>
    </Modal>
  );
}
