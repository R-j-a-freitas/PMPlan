import { useEffect, useState } from 'react';
import { useEngineerStore, useHospitalStore, useUiStore, useZoneStore } from '../../stores';
import { resolveZoneTeamLeaderId } from '../../lib/zoneTree';
import type { Zone } from '../../types';
import { Badge, Button } from '../ui';
import { ZoneEngineers } from './ZoneEngineers';
import { useT } from '../../i18n';

interface ZoneNodeProps {
  zone: Zone;
  depth: number;
  allZones: Zone[];
  canManageZones: boolean;
}

// `color` continua no formulário só para ser reenviada intacta no update — a coluna
// mantém-se na BD e nas views, mas deixou de ser editável e de pintar seja o que for
// na UI (a única cor com significado é a do equipamento).
function buildForm(zone: Zone) {
  return {
    name: zone.name,
    code: zone.code,
    color: zone.color,
    parentZoneId: zone.parent_zone_id ?? '',
    teamLeaderId: zone.team_leader_engineer_id ?? '',
  };
}

// Todos os descendentes de uma zona — usado para nunca a deixar escolher um dos seus
// próprios filhos/netos como zona-mãe (o trigger no Postgres também bloqueia, isto é
// só para a UI não deixar tentar).
function getDescendantIds(zoneId: string, allZones: Zone[]): Set<string> {
  const result = new Set<string>();
  const stack = [zoneId];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const candidate of allZones) {
      if (candidate.parent_zone_id === current && !result.has(candidate.id)) {
        result.add(candidate.id);
        stack.push(candidate.id);
      }
    }
  }
  return result;
}

// Nó recursivo da árvore de zonas (secção: zona-mãe "Northwest" agrupando "Galiza",
// "Canárias", etc.) — cada zona gere a sua própria edição e renderiza as suas filhas.
export function ZoneNode({ zone, depth, allZones, canManageZones }: ZoneNodeProps) {
  const t = useT();
  const updateZone = useZoneStore((state) => state.updateZone);
  const deleteZone = useZoneStore((state) => state.deleteZone);
  const hospitals = useHospitalStore((state) => state.hospitals);
  const engineers = useEngineerStore((state) => state.engineers);
  const fetchEngineers = useEngineerStore((state) => state.fetchEngineers);
  const pushToast = useUiStore((state) => state.pushToast);

  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => buildForm(zone));

  // A página de Zonas não carregava engenheiros — passa a precisar deles para o selector
  // de Team Leader.
  useEffect(() => {
    if (engineers.length === 0) fetchEngineers();
  }, [engineers.length, fetchEngineers]);

  const children = allZones.filter((candidate) => candidate.parent_zone_id === zone.id);
  const zoneHospitals = hospitals.filter((hospital) => hospital.zone_id === zone.id);
  const descendantIds = getDescendantIds(zone.id, allZones);
  const parentOptions = allZones.filter(
    (candidate) => candidate.id !== zone.id && !descendantIds.has(candidate.id),
  );

  // TL próprio vs. herdado da zona-mãe — a distinção importa na UI: uma zona-filha sem TL
  // próprio não está "sem responsável", está a usar o da mãe, e mostrar isso evita que
  // alguém o volte a definir zona a zona.
  const ownTeamLeader = engineers.find((engineer) => engineer.id === zone.team_leader_engineer_id) ?? null;
  const inheritedTeamLeaderId = zone.team_leader_engineer_id ? null : resolveZoneTeamLeaderId(zone.parent_zone_id, allZones);
  const inheritedTeamLeader = engineers.find((engineer) => engineer.id === inheritedTeamLeaderId) ?? null;

  function startEdit() {
    setForm(buildForm(zone));
    setEditing(true);
  }

  async function handleSave() {
    if (!form.name || !form.code) return;
    setSaving(true);
    try {
      await updateZone(zone.id, {
        name: form.name,
        code: form.code,
        color: form.color,
        parent_zone_id: form.parentZoneId || null,
        team_leader_engineer_id: form.teamLeaderId || null,
      });
      setEditing(false);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('zones.updateFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteZone(zone.id);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('zones.deleteFailed') });
    }
  }

  return (
    <div style={{ marginLeft: depth * 24 }} className="rounded-md border border-gray-200">
      <div className="flex items-center gap-2 px-3 py-2">
        {editing ? (
          <>
            <input
              className="w-24 pm-field"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
            />
            <input
              className="pm-field"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <select
              className="pm-field"
              value={form.parentZoneId}
              onChange={(event) => setForm({ ...form, parentZoneId: event.target.value })}
            >
              <option value="">{t('zones.field.noParentShort')}</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            {/* Team Leader: entra sempre em CC nos emails aos clientes desta zona. Vazio
                numa zona-filha não é "sem TL" — herda o da zona-mãe (ver placeholder). */}
            <select
              className="pm-field"
              title={t('zones.teamLeaderTitle')}
              value={form.teamLeaderId}
              onChange={(event) => setForm({ ...form, teamLeaderId: event.target.value })}
            >
              <option value="">
                {inheritedTeamLeader
                  ? t('zones.teamLeaderInherited', { name: inheritedTeamLeader.name })
                  : t('zones.teamLeaderNoneOption')}
              </option>
              {engineers.map((engineer) => (
                <option key={engineer.id} value={engineer.id}>
                  {engineer.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <Badge variant="neutral">{zone.code}</Badge>
            <span className="text-sm font-medium">{zone.name}</span>
            <span className="text-xs text-gray-400">
              {t('zones.hospitalCount', { count: zoneHospitals.length })}
            </span>
            {/* O TL é a informação que decide o CC dos emails ao cliente — fica visível
                sem ter de abrir a edição, e um vazio a sério (nem próprio nem herdado)
                aparece a vermelho porque significa envios sem TL em cópia. */}
            {ownTeamLeader && (
              <span className="text-xs text-gray-500">
                {t('zones.teamLeaderOwn')}{' '}
                <span className="font-medium text-gray-700">{ownTeamLeader.name}</span>
              </span>
            )}
            {!ownTeamLeader && inheritedTeamLeader && (
              <span className="text-xs text-gray-400">
                {t('zones.teamLeaderInheritedShort', { name: inheritedTeamLeader.name })}
              </span>
            )}
            {!ownTeamLeader && !inheritedTeamLeader && (
              <span className="text-xs font-medium text-red-600">{t('zones.teamLeaderMissing')}</span>
            )}
          </>
        )}
        <div className="ml-auto flex gap-1">
          {editing ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {t('common.save')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
                {expanded ? t('common.close') : t('zones.manage')}
              </Button>
              {canManageZones && (
                <>
                  <Button variant="secondary" size="sm" onClick={startEdit}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="dangerGhost" size="sm" onClick={handleDelete}>
                    {t('common.delete')}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {expanded && !editing && (
        <div className="grid grid-cols-2 gap-4 border-t border-gray-200 p-3">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">{t('common.hospitals')}</h4>
            {zoneHospitals.length === 0 && <p className="text-sm text-gray-400">{t('zones.noHospitals')}</p>}
            <ul className="flex flex-col gap-0.5 text-sm">
              {zoneHospitals.map((hospital) => (
                <li key={hospital.id}>
                  {hospital.name} <span className="text-xs text-gray-400">({hospital.country})</span>
                </li>
              ))}
            </ul>
          </div>
          <ZoneEngineers zoneId={zone.id} readOnly={!canManageZones} />
        </div>
      )}

      {children.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-gray-200 p-2">
          {children.map((child) => (
            <ZoneNode key={child.id} zone={child} depth={depth + 1} allZones={allZones} canManageZones={canManageZones} />
          ))}
        </div>
      )}
    </div>
  );
}
