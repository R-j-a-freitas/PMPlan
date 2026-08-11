import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { exportRowsToSpreadsheet } from '../lib/spreadsheet';
import { useAuthStore, useHospitalStore, useUiStore } from '../stores';
import type { HospitalContact, HospitalWithZone } from '../types';
import { matchesSearch } from '../lib/searchText';
import { Badge, Button, FormModal, SearchInput } from '../components/ui';

interface ContactRow {
  hospitalId: string;
  hospitalName: string;
  zoneName: string;
  zoneColor: string;
  /** Índice do contacto dentro de hospital.contacts — necessário para editar/apagar a
   *  posição certa (os contactos vivem num array JSON no próprio hospital, não têm id). */
  contactIndex: number;
  name: string;
  role: string;
  email: string;
  phone: string;
}

type ContactForm = { name: string; role: string; email: string; phone: string };

const EMPTY_FORM: ContactForm & { hospitalId: string } = {
  hospitalId: '',
  name: '',
  role: '',
  email: '',
  phone: '',
};

function buildContactRows(hospitals: HospitalWithZone[]): ContactRow[] {
  return hospitals.flatMap((hospital) =>
    hospital.contacts.map((contact, contactIndex) => ({
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      zoneName: hospital.zone_name,
      zoneColor: hospital.zone_color,
      contactIndex,
      name: contact.name,
      role: contact.role ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
    })),
  );
}

type NewContactForm = typeof EMPTY_FORM;

// Introdução de novo contacto — ver FormModal para o porquê de estar em modal. O hospital
// é obrigatório: um contacto vive sempre dentro de hospitals.contacts.
function ContactFormModal({
  hospitals,
  saving,
  onCancel,
  onSubmit,
}: {
  hospitals: HospitalWithZone[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: NewContactForm) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  return (
    <FormModal
      title="Novo contacto"
      saving={saving}
      canSubmit={Boolean(form.hospitalId && form.name.trim())}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <select
        className="col-span-2 rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={form.hospitalId}
        onChange={(event) => setForm({ ...form, hospitalId: event.target.value })}
      >
        <option value="">Hospital… (obrigatório)</option>
        {hospitals.map((hospital) => (
          <option key={hospital.id} value={hospital.id}>
            {hospital.name}
          </option>
        ))}
      </select>
      <input
        autoFocus
        placeholder="Nome"
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <input
        placeholder="Cargo (ex: Coordenador Técnico)"
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={form.role}
        onChange={(event) => setForm({ ...form, role: event.target.value })}
      />
      <input
        type="email"
        placeholder="Email"
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={form.email}
        onChange={(event) => setForm({ ...form, email: event.target.value })}
      />
      <input
        placeholder="Telefone"
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={form.phone}
        onChange={(event) => setForm({ ...form, phone: event.target.value })}
      />
    </FormModal>
  );
}

// Vista consolidada de todos os contactos registados em todos os hospitais (secção:
// "mostra todos os contactos registados"). A gestão (criar/editar/apagar) fica reservada
// a quem gere hospitais (canManageZones), já que os contactos vivem em hospitals.contacts.
export function Contacts() {
  const canManage = useAuthStore((state) => state.permissions.canManageZones);
  const hospitals = useHospitalStore((state) => state.hospitals);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  const updateHospital = useHospitalStore((state) => state.updateHospital);
  const pushToast = useUiStore((state) => state.pushToast);
  const [searchText, setSearchText] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ hospitalId: string; contactIndex: number } | null>(null);
  const [editForm, setEditForm] = useState<ContactForm>({ name: '', role: '', email: '', phone: '' });

  useEffect(() => {
    fetchHospitals();
  }, [fetchHospitals]);

  const allRows = useMemo(() => buildContactRows(hospitals), [hospitals]);

  const filteredRows = useMemo(
    () =>
      allRows.filter((row) =>
        matchesSearch(searchText, [row.name, row.role, row.email, row.phone, row.hospitalName, row.zoneName]),
      ),
    [allRows, searchText],
  );

  function handleExport() {
    exportRowsToSpreadsheet(
      filteredRows.map((row) => ({
        Nome: row.name,
        Cargo: row.role,
        Email: row.email,
        Telefone: row.phone,
        Hospital: row.hospitalName,
        Zona: row.zoneName,
      })),
      'pmplan-contactos.xlsx',
      'Contactos',
    );
  }

  // Converte o form em HospitalContact, omitindo campos vazios (a coluna é texto livre e o
  // resto da app trata email/phone/role como opcionais).
  function toContact(source: ContactForm): HospitalContact {
    return {
      name: source.name.trim(),
      role: source.role.trim() || undefined,
      email: source.email.trim() || undefined,
      phone: source.phone.trim() || undefined,
    };
  }

  async function handleAdd(form: NewContactForm) {
    if (!form.hospitalId || !form.name.trim()) return;
    const hospital = hospitals.find((h) => h.id === form.hospitalId);
    if (!hospital) return;
    setSaving(true);
    try {
      await updateHospital(hospital.id, { contacts: [...hospital.contacts, toContact(form)] });
      setCreating(false);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao adicionar contacto.' });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: ContactRow) {
    setEditing({ hospitalId: row.hospitalId, contactIndex: row.contactIndex });
    setEditForm({ name: row.name, role: row.role, email: row.email, phone: row.phone });
  }

  async function handleSaveEdit() {
    if (!editing || !editForm.name.trim()) return;
    const hospital = hospitals.find((h) => h.id === editing.hospitalId);
    if (!hospital) return;
    setSaving(true);
    try {
      const contacts = hospital.contacts.map((contact, index) =>
        index === editing.contactIndex ? toContact(editForm) : contact,
      );
      await updateHospital(hospital.id, { contacts });
      setEditing(null);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao actualizar contacto.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: ContactRow) {
    const hospital = hospitals.find((h) => h.id === row.hospitalId);
    if (!hospital) return;
    if (!window.confirm(`Apagar o contacto "${row.name}" de ${row.hospitalName}?`)) return;
    setSaving(true);
    try {
      const contacts = hospital.contacts.filter((_, index) => index !== row.contactIndex);
      await updateHospital(hospital.id, { contacts });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao apagar contacto.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Contactos</h1>
          <div className="flex items-center gap-2">
            {canManage && <Button onClick={() => setCreating(true)}>Adicionar</Button>}
            <Button variant="secondary" onClick={handleExport} disabled={filteredRows.length === 0}>
              Exportar
            </Button>
          </div>
        </div>

        <SearchInput
          value={searchText}
          onChange={setSearchText}
          placeholder="Procurar por nome, cargo, email, telefone, hospital ou zona…"
        />

        {filteredRows.length === 0 ? (
          <p className="text-sm text-gray-400">
            {allRows.length === 0
              ? canManage
                ? 'Sem contactos registados — adiciona o primeiro em "Adicionar".'
                : 'Sem contactos registados.'
              : 'Nenhum contacto corresponde à pesquisa.'}
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-1.5 pr-2">Nome</th>
                <th className="py-1.5 pr-2">Cargo</th>
                <th className="py-1.5 pr-2">Email</th>
                <th className="py-1.5 pr-2">Telefone</th>
                <th className="py-1.5 pr-2">Hospital</th>
                <th className="py-1.5 pr-2">Zona</th>
                {canManage && <th className="py-1.5 pr-2" />}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isEditing =
                  editing?.hospitalId === row.hospitalId && editing?.contactIndex === row.contactIndex;
                return (
                  <tr key={`${row.hospitalId}-${row.contactIndex}`} className="border-b border-gray-100">
                    {isEditing ? (
                      <>
                        <td className="py-1.5 pr-2">
                          <input
                            className="w-full rounded-md border border-gray-300 px-2 py-1"
                            value={editForm.name}
                            onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            className="w-full rounded-md border border-gray-300 px-2 py-1"
                            value={editForm.role}
                            onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            type="email"
                            className="w-full rounded-md border border-gray-300 px-2 py-1"
                            value={editForm.email}
                            onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            className="w-full rounded-md border border-gray-300 px-2 py-1"
                            value={editForm.phone}
                            onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">{row.hospitalName}</td>
                        <td className="py-1.5 pr-2">
                          <Badge color={row.zoneColor}>{row.zoneName}</Badge>
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
                              Cancelar
                            </Button>
                            <Button onClick={handleSaveEdit} disabled={saving || !editForm.name.trim()}>
                              Guardar
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-1.5 pr-2">{row.name}</td>
                        <td className="py-1.5 pr-2">{row.role || '—'}</td>
                        <td className="py-1.5 pr-2">{row.email || '—'}</td>
                        <td className="py-1.5 pr-2">{row.phone || '—'}</td>
                        <td className="py-1.5 pr-2">{row.hospitalName}</td>
                        <td className="py-1.5 pr-2">
                          <Badge color={row.zoneColor}>{row.zoneName}</Badge>
                        </td>
                        {canManage && (
                          <td className="py-1.5 pr-2 text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="secondary" onClick={() => startEdit(row)} disabled={saving}>
                                Editar
                              </Button>
                              <Button variant="danger" onClick={() => handleDelete(row)} disabled={saving}>
                                Eliminar
                              </Button>
                            </div>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <ContactFormModal
          hospitals={hospitals}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSubmit={handleAdd}
        />
      )}
    </div>
  );
}
