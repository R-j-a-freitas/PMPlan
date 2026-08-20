import { useState } from 'react';
import { useHospitalStore, useUiStore } from '../../stores';
import type { HospitalContact } from '../../types';
import { Button, EmptyState, Modal } from '../ui';

interface HospitalContactsModalProps {
  hospitalId: string;
  hospitalName: string;
  contacts: HospitalContact[];
  onClose: () => void;
}

const EMPTY_CONTACT: HospitalContact = { name: '', email: '', phone: '', role: '' };

// Contactos do hospital (nome/email/telefone/cargo) — usados como destinatários das
// propostas de calendarização e da carta de assinatura (página Aprovações).
export function HospitalContactsModal({ hospitalId, hospitalName, contacts, onClose }: HospitalContactsModalProps) {
  const updateHospital = useHospitalStore((state) => state.updateHospital);
  const pushToast = useUiStore((state) => state.pushToast);
  const [rows, setRows] = useState<HospitalContact[]>(contacts.length > 0 ? contacts : []);
  const [draft, setDraft] = useState<HospitalContact>(EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);

  function addContact() {
    if (!draft.name) return;
    setRows([...rows, draft]);
    setDraft(EMPTY_CONTACT);
  }

  function removeContact(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateHospital(hospitalId, { contacts: rows });
      onClose();
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao gravar contactos.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Contactos — ${hospitalName}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="mb-4 max-h-52 overflow-y-auto rounded-lg border border-gray-200">
        {rows.length === 0 && <EmptyState size="compact">Sem contactos registados.</EmptyState>}
        {rows.map((contact, index) => (
          <div
            key={`${contact.email ?? contact.name}-${index}`}
            className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-0"
          >
            <div className="min-w-0 flex-1">
              <span className="font-medium text-gray-800">{contact.name}</span>
              {contact.role && <span className="text-xs text-gray-400"> — {contact.role}</span>}
              <div className="truncate text-xs text-gray-500">
                {contact.email ?? '—'} {contact.phone && `· ${contact.phone}`}
              </div>
            </div>
            <Button variant="dangerGhost" size="sm" onClick={() => removeContact(index)}>
              Remover
            </Button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Nome"
            className="pm-field"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
          <input
            placeholder="Cargo (ex: Coordenador Técnico)"
            className="pm-field"
            value={draft.role}
            onChange={(event) => setDraft({ ...draft, role: event.target.value })}
          />
          <input
            type="email"
            placeholder="Email"
            className="pm-field"
            value={draft.email}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
          />
          <input
            placeholder="Telefone"
            className="pm-field"
            value={draft.phone}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
          />
        <Button variant="secondary" className="col-span-2" onClick={addContact} disabled={!draft.name}>
          Adicionar contacto
        </Button>
      </div>
    </Modal>
  );
}
