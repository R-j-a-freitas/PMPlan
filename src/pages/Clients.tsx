import { useEffect, useMemo, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { buildHospitalExportRows, parseHospitalImportRows } from '../lib/importers/hospitalImportExport';
import { SPANISH_REGIONS, spanishRegionName } from '../lib/spanishRegions';
import { exportRowsToSpreadsheet, readSpreadsheetFile } from '../lib/spreadsheet';
import type { ParsedImportRow } from '../lib/spreadsheet';
import { getLeafZones } from '../lib/zoneTree';
import { useAuthStore, useHolidayRuleStore, useHospitalStore, useUiStore, useZoneStore } from '../stores';
import type { Country, HospitalInsert, Zone } from '../types';
import { HospitalContactsModal } from '../components/modals/HospitalContactsModal';
import { ImportPreviewModal } from '../components/modals/ImportPreviewModal';
import { Badge, Button, ImportExportButtons } from '../components/ui';

const EMPTY_FORM = { name: '', shortName: '', country: 'PT' as Country, locality: '', city: '', zoneId: '' };

// PT: concelho em texto livre, sugerido por datalist a partir dos concelhos com regra de
// feriado municipal já conhecida (holiday_rules) — escolher um destes garante que o
// feriado fica logo associado, sem precisar de mais nenhum passo. ES: Comunidade
// Autónoma por selector — o código tem de bater certo com o que a Nager.Date usa em
// "counties" para os feriados regionais casarem automaticamente.
function LocalityField({
  country,
  value,
  onChange,
}: {
  country: Country;
  value: string;
  onChange: (value: string) => void;
}) {
  if (country === 'PT') {
    // datalist partilhado, definido uma única vez no componente pai (ver "pt-concelhos"
    // abaixo) — dois <input list="pt-concelhos"> em simultâneo (criar + editar) não
    // podem ter cada um o seu próprio <datalist> com o mesmo id (HTML inválido).
    return (
      <input
        list="pt-concelhos"
        placeholder="Concelho (ex: Braga)"
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <select
      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Comunidade Autónoma…</option>
      {SPANISH_REGIONS.map((region) => (
        <option key={region.code} value={region.code}>
          {region.name}
        </option>
      ))}
    </select>
  );
}

// Zona-mãe (ex: "Northwest") agrupa zonas-filhas (ex: Galiza, Canárias) só para
// atribuição de engenheiros — hospitais ficam sempre numa zona-folha (leafZones), mas o
// selector mostra a zona-mãe como agrupamento visual para ser fácil perceber a que
// "família" cada zona-folha pertence. Zonas-folha sem mãe (topo da hierarquia) ficam
// fora de qualquer optgroup.
function ZoneSelect({
  value,
  onChange,
  leafZones,
  zones,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  leafZones: Zone[];
  zones: Zone[];
  placeholder?: string;
}) {
  const ungrouped = leafZones.filter((zone) => !zone.parent_zone_id);
  const groups = new Map<string, { parentName: string; children: Zone[] }>();
  for (const zone of leafZones) {
    if (!zone.parent_zone_id) continue;
    const parent = zones.find((candidate) => candidate.id === zone.parent_zone_id);
    if (!parent) continue;
    const group = groups.get(parent.id) ?? { parentName: parent.name, children: [] };
    group.children.push(zone);
    groups.set(parent.id, group);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => a.parentName.localeCompare(b.parentName));

  return (
    <select
      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {ungrouped.map((zone) => (
        <option key={zone.id} value={zone.id}>
          {zone.name}
        </option>
      ))}
      {sortedGroups.map((group) => (
        <optgroup key={group.parentName} label={group.parentName}>
          {group.children.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// CRUD clientes/hospitais (secção 3) — zona é sempre obrigatória (secção 4: é a origem da
// hierarquia; equipment.zone_id deriva sempre de hospitals.zone_id). País fica aqui (não
// na zona): a mesma zona pode agrupar hospitais de PT e de ES. Gestão exclusiva do admin.
export function Clients() {
  const canManageZones = useAuthStore((state) => state.permissions.canManageZones);
  const hospitals = useHospitalStore((state) => state.hospitals);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  const createHospital = useHospitalStore((state) => state.createHospital);
  const updateHospital = useHospitalStore((state) => state.updateHospital);
  const deleteHospital = useHospitalStore((state) => state.deleteHospital);
  const bulkCreateHospital = useHospitalStore((state) => state.bulkCreateHospital);
  const zones = useZoneStore((state) => state.zones);
  const fetchZones = useZoneStore((state) => state.fetchZones);
  const pushToast = useUiStore((state) => state.pushToast);
  const holidayRules = useHolidayRuleStore((state) => state.rules);
  const fetchHolidayRules = useHolidayRuleStore((state) => state.fetchRules);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [importRows, setImportRows] = useState<ParsedImportRow<HospitalInsert>[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [contactsHospitalId, setContactsHospitalId] = useState<string | null>(null);

  const leafZones = getLeafZones(zones);

  const ptLocalities = useMemo(
    () =>
      [...new Set(holidayRules.filter((rule) => rule.country === 'PT').map((rule) => rule.locality))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [holidayRules],
  );

  useEffect(() => {
    fetchHospitals();
    fetchZones();
    fetchHolidayRules();
  }, [fetchHospitals, fetchZones, fetchHolidayRules]);

  async function handleCreate() {
    if (!form.name || !form.zoneId) return;
    setSaving(true);
    try {
      await createHospital({
        name: form.name,
        short_name: form.shortName || null,
        address: null,
        country: form.country,
        locality: form.locality || null,
        city: form.country === 'ES' ? form.city || null : null,
        zone_id: form.zoneId,
        contacts: [],
        active: true,
      });
      setForm(EMPTY_FORM);
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    exportRowsToSpreadsheet(buildHospitalExportRows(hospitals), 'pmplan-hospitais.xlsx', 'Hospitais');
  }

  async function handleFileSelected(file: File) {
    try {
      const raw = await readSpreadsheetFile(file);
      setImportRows(parseHospitalImportRows(raw, leafZones));
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao ler o ficheiro.' });
    }
  }

  async function handleConfirmImport() {
    if (!importRows) return;
    const validRows = importRows
      .filter((row): row is ParsedImportRow<HospitalInsert> & { data: HospitalInsert } => row.data !== null)
      .map((row) => ({ rowNumber: row.rowNumber, data: row.data }));

    setImporting(true);
    try {
      const { success, errors } = await bulkCreateHospital(validRows);
      pushToast({
        variant: errors.length > 0 ? 'warning' : 'success',
        message:
          errors.length > 0
            ? `${success} hospital(is) importado(s), ${errors.length} falharam: ${errors.map((e) => `linha ${e.rowNumber}`).join(', ')}.`
            : `${success} hospital(is) importado(s) com sucesso.`,
      });
      setImportRows(null);
    } finally {
      setImporting(false);
    }
  }

  function startEdit(hospital: {
    id: string;
    name: string;
    short_name: string | null;
    country: Country;
    locality: string | null;
    city: string | null;
    zone_id: string;
  }) {
    setEditingId(hospital.id);
    setEditForm({
      name: hospital.name,
      shortName: hospital.short_name ?? '',
      country: hospital.country,
      locality: hospital.locality ?? '',
      city: hospital.city ?? '',
      zoneId: hospital.zone_id,
    });
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.name || !editForm.zoneId) return;
    setSaving(true);
    try {
      await updateHospital(id, {
        name: editForm.name,
        short_name: editForm.shortName || null,
        country: editForm.country,
        locality: editForm.locality || null,
        city: editForm.country === 'ES' ? editForm.city || null : null,
        zone_id: editForm.zoneId,
      });
      setEditingId(null);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao actualizar hospital.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <datalist id="pt-concelhos">
        {ptLocalities.map((locality) => (
          <option key={locality} value={locality} />
        ))}
      </datalist>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Hospitais</h1>
          {canManageZones && <ImportExportButtons onExport={handleExport} onFileSelected={handleFileSelected} />}
        </div>

        {canManageZones && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
            <input
              placeholder="Nome"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <input
              placeholder="Nome curto (ex: IPO Porto)"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.shortName}
              onChange={(event) => setForm({ ...form, shortName: event.target.value })}
            />
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={form.country}
              onChange={(event) =>
                setForm({ ...form, country: event.target.value as Country, locality: '', city: '' })
              }
            >
              <option value="PT">Portugal</option>
              <option value="ES">Espanha</option>
            </select>
            <LocalityField
              country={form.country}
              value={form.locality}
              onChange={(locality) => setForm({ ...form, locality })}
            />
            {form.country === 'ES' && (
              <input
                placeholder="Cidade (ex: Vigo)"
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
              />
            )}
            <ZoneSelect
              value={form.zoneId}
              onChange={(zoneId) => setForm({ ...form, zoneId })}
              leafZones={leafZones}
              zones={zones}
              placeholder="Zona… (obrigatório)"
            />
            <Button onClick={handleCreate} disabled={saving || !form.name || !form.zoneId}>
              Adicionar
            </Button>
          </div>
        )}

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1.5 pr-2">Nome</th>
              <th className="py-1.5 pr-2">Nome curto</th>
              <th className="py-1.5 pr-2">País</th>
              <th className="py-1.5 pr-2">Localidade</th>
              <th className="py-1.5 pr-2">Cidade</th>
              <th className="py-1.5 pr-2">Zona</th>
              <th className="py-1.5 pr-2">Contactos</th>
              <th className="py-1.5 pr-2" />
            </tr>
          </thead>
          <tbody>
            {hospitals.map((hospital) => {
              const editing = editingId === hospital.id;
              return (
                <tr key={hospital.id} className="border-b border-gray-100">
                  {editing ? (
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
                          value={editForm.shortName}
                          onChange={(event) => setEditForm({ ...editForm, shortName: event.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <select
                          className="rounded-md border border-gray-300 px-2 py-1"
                          value={editForm.country}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              country: event.target.value as Country,
                              locality: '',
                              city: '',
                            })
                          }
                        >
                          <option value="PT">Portugal</option>
                          <option value="ES">Espanha</option>
                        </select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <LocalityField
                          country={editForm.country}
                          value={editForm.locality}
                          onChange={(locality) => setEditForm({ ...editForm, locality })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        {editForm.country === 'ES' && (
                          <input
                            placeholder="Cidade"
                            className="w-full rounded-md border border-gray-300 px-2 py-1"
                            value={editForm.city}
                            onChange={(event) => setEditForm({ ...editForm, city: event.target.value })}
                          />
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <ZoneSelect
                          value={editForm.zoneId}
                          onChange={(zoneId) => setEditForm({ ...editForm, zoneId })}
                          leafZones={leafZones}
                          zones={zones}
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-xs text-gray-400">
                        {hospital.contacts.length > 0 ? hospital.contacts.map((c) => c.name).join(', ') : '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" onClick={() => setEditingId(null)} disabled={saving}>
                            Cancelar
                          </Button>
                          <Button onClick={() => handleSaveEdit(hospital.id)} disabled={saving}>
                            Guardar
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2">{hospital.name}</td>
                      <td className="py-1.5 pr-2">{hospital.short_name}</td>
                      <td className="py-1.5 pr-2">{hospital.country}</td>
                      <td className="py-1.5 pr-2">
                        {hospital.locality
                          ? hospital.country === 'ES'
                            ? spanishRegionName(hospital.locality)
                            : hospital.locality
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-2">{hospital.city ?? '—'}</td>
                      <td className="py-1.5 pr-2">
                        <Badge color={hospital.zone_color}>{hospital.zone_code}</Badge>
                      </td>
                      <td className="py-1.5 pr-2">
                        {hospital.contacts.length > 0 ? hospital.contacts.map((c) => c.name).join(', ') : '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        {canManageZones && (
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setContactsHospitalId(hospital.id)}>
                              Contactos
                            </Button>
                            <Button variant="secondary" onClick={() => startEdit(hospital)}>
                              Editar
                            </Button>
                            <Button variant="danger" onClick={() => deleteHospital(hospital.id)}>
                              Eliminar
                            </Button>
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {importRows && (
        <ImportPreviewModal
          title="Importar hospitais"
          rows={importRows}
          renderPreview={(data) => data.name}
          importing={importing}
          onConfirm={handleConfirmImport}
          onClose={() => setImportRows(null)}
        />
      )}

      {contactsHospitalId && (
        <HospitalContactsModal
          hospitalId={contactsHospitalId}
          hospitalName={hospitals.find((hospital) => hospital.id === contactsHospitalId)?.name ?? ''}
          contacts={hospitals.find((hospital) => hospital.id === contactsHospitalId)?.contacts ?? []}
          onClose={() => setContactsHospitalId(null)}
        />
      )}
    </div>
  );
}
