import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { exportRowsToSpreadsheet } from '../lib/spreadsheet';
import { useAuthStore, useHospitalStore, useUiStore } from '../stores';
import type { HospitalContact, HospitalWithZone } from '../types';
import { matchesSearch } from '../lib/searchText';
import { Badge, Button, Card, EmptyState, FormModal, PageHeader, SearchInput } from '../components/ui';

interface ContactRow {
  hospitalId: string;
  hospitalName: string;
  zoneName: string;
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
        className="col-span-2 pm-field"
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
        className="pm-field"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <input
        placeholder="Cargo (ex: Coordenador Técnico)"
        className="pm-field"
        value={form.role}
        onChange={(event) => setForm({ ...form, role: event.target.value })}
      />
      <input
        type="email"
        placeholder="Email"
        className="pm-field"
        value={form.email}
        onChange={(event) => setForm({ ...form, email: event.target.value })}
      />
      <input
        placeholder="Telefone"
        className="pm-field"
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
    <PageShell>
      <PageHeader
        title="Contactos"
        description="Todos os contactos registados nos hospitais, numa lista só. Cada contacto vive no hospital a que pertence."
        actions={
          <>
            <Button variant="secondary" onClick={handleExport} disabled={filteredRows.length === 0}>
              Exportar
            </Button>
            {canManage && <Button onClick={() => setCreating(true)}>Adicionar contacto</Button>}
          </>
        }
      />

      <Card
        padded={false}
        title={`${filteredRows.length} contacto(s)`}
        actions={
          <SearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder="Procurar por nome, cargo, email, hospital…"
            className="w-72"
          />
        }
      >
        {filteredRows.length === 0 ? (
          <EmptyState
            action={
              allRows.length === 0 && canManage ? (
                <Button onClick={() => setCreating(true)}>Adicionar contacto</Button>
              ) : undefined
            }
          >
            {allRows.length === 0 ? 'Ainda não há contactos registados.' : 'Nenhum contacto corresponde à pesquisa.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
          <table className="pm-table">
            <thead>
              <tr>
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
                  <tr key={`${row.hospitalId}-${row.contactIndex}`}>
                    {isEditing ? (
                      <>
                        <td className="py-1.5 pr-2">
                          <input
                            className="pm-field w-full"
                            value={editForm.name}
                            onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            className="pm-field w-full"
                            value={editForm.role}
                            onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            type="email"
                            className="pm-field w-full"
                            value={editForm.email}
                            onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            className="pm-field w-full"
                            value={editForm.phone}
                            onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
                          />
                        </td>
                        <td className="py-1.5 pr-2">{row.hospitalName}</td>
                        <td className="py-1.5 pr-2">
                          <Badge variant="neutral">{row.zoneName}</Badge>
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button variant="secondary" size="sm" onClick={() => setEditing(null)} disabled={saving}>
                              Cancelar
                            </Button>
                            <Button size="sm" onClick={handleSaveEdit} disabled={saving || !editForm.name.trim()}>
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
                          <Badge variant="neutral">{row.zoneName}</Badge>
                        </td>
                        {canManage && (
                          <td className="py-1.5 pr-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="secondary" size="sm" onClick={() => startEdit(row)} disabled={saving}>
                                Editar
                              </Button>
                              <Button
                                variant="dangerGhost"
                                size="sm"
                                onClick={() => handleDelete(row)}
                                disabled={saving}
                              >
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
          </div>
        )}
      </Card>

      {creating && (
        <ContactFormModal
          hospitals={hospitals}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSubmit={handleAdd}
        />
      )}
    </PageShell>
  );
}
