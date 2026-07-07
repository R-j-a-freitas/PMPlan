import { useState } from 'react';
import { useHospitalStore, useUiStore } from '../../stores';
import type { HospitalContact } from '../../types';
import { Button } from '../ui';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Contactos — {hospitalName}</h2>

        <div className="mb-3 max-h-52 overflow-y-auto rounded-md border border-gray-200">
          {rows.length === 0 && <p className="p-2 text-sm text-gray-500">Sem contactos registados.</p>}
          {rows.map((contact, index) => (
            <div
              key={`${contact.email ?? contact.name}-${index}`}
              className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-sm last:border-0"
            >
              <div className="flex-1">
                <span className="font-medium">{contact.name}</span>
                {contact.role && <span className="text-xs text-gray-400"> — {contact.role}</span>}
                <div className="text-xs text-gray-500">
                  {contact.email ?? '—'} {contact.phone && `· ${contact.phone}`}
                </div>
              </div>
              <Button variant="danger" onClick={() => removeContact(index)}>
                Remover
              </Button>
            </div>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <input
            placeholder="Nome"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
          <input
            placeholder="Cargo (ex: Coordenador Técnico)"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={draft.role}
            onChange={(event) => setDraft({ ...draft, role: event.target.value })}
          />
          <input
            type="email"
            placeholder="Email"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={draft.email}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
          />
          <input
            placeholder="Telefone"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={draft.phone}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
          />
          <Button variant="secondary" className="col-span-2" onClick={addContact} disabled={!draft.name}>
            Adicionar contacto
          </Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
