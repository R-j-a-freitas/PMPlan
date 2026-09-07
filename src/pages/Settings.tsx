import { useEffect, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { ZoneNode } from '../components/settings';
import { useAuthStore, useHospitalStore, useUiStore, useZoneStore } from '../stores';
import type { Zone } from '../types';
import { Button, Card, EmptyState, FormModal, PageHeader } from '../components/ui';
import { useT, type TFunction } from '../i18n';

// A cor deixou de ser editável e de pintar seja o que for na UI (a única cor com
// significado é a do equipamento) — a coluna mantém-se na BD e nas views, e uma zona
// nova nasce com este cinzento neutro em vez de uma cor escolhida à mão.
const ZONE_DEFAULT_COLOR = '#6B7280';

const EMPTY_FORM = { name: '', code: '', parentZoneId: '' };

type ZoneForm = typeof EMPTY_FORM;

// Introdução de nova zona — ver FormModal para o porquê de estar em modal. Estado próprio,
// montado só enquanto está aberto, para cada abertura começar com os campos limpos.
function ZoneFormModal({
  t,
  zones,
  saving,
  onCancel,
  onSubmit,
}: {
  t: TFunction;
  zones: Zone[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: ZoneForm) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  return (
    <FormModal
      title={t('zones.new')}
      submitLabel={t('zones.add')}
      saving={saving}
      canSubmit={Boolean(form.name.trim() && form.code.trim())}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <input
        autoFocus
        placeholder={t('zones.field.name')}
        className="pm-field"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <input
        placeholder={t('zones.field.code')}
        className="pm-field"
        value={form.code}
        onChange={(event) => setForm({ ...form, code: event.target.value })}
      />
      <select
        className="col-span-2 pm-field"
        value={form.parentZoneId}
        onChange={(event) => setForm({ ...form, parentZoneId: event.target.value })}
      >
        <option value="">{t('zones.field.noParent')}</option>
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {t('zones.field.inside', { zone: zone.name })}
          </option>
        ))}
      </select>
      {/* O TL não se define aqui: uma zona-filha herda o da zona-mãe (o caso normal) e
          uma zona de topo define-o em "Editar" depois de criada. */}
      <p className="col-span-2 text-xs text-gray-500">{t('zones.teamLeaderLater')}</p>
    </FormModal>
  );
}

// Configurações → Zonas (secção 3/4): CRUD completo pelo admin — nome, hospitais e
// engenheiros da zona. Hierárquica: uma zona-mãe (ex: "Northwest") pode agrupar
// várias zonas-filhas (ex: "Galiza", "Canárias") — ver ZoneNode para a árvore.
export function Settings() {
  const t = useT();
  const canManageZones = useAuthStore((state) => state.permissions.canManageZones);
  const zones = useZoneStore((state) => state.zones);
  const fetchZones = useZoneStore((state) => state.fetchZones);
  const createZone = useZoneStore((state) => state.createZone);
  const fetchHospitals = useHospitalStore((state) => state.fetchHospitals);
  const pushToast = useUiStore((state) => state.pushToast);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchZones();
    fetchHospitals();
  }, [fetchZones, fetchHospitals]);

  async function handleCreate(form: ZoneForm) {
    if (!form.name || !form.code) return;
    setSaving(true);
    try {
      await createZone({
        name: form.name,
        code: form.code,
        description: null,
        color: ZONE_DEFAULT_COLOR,
        parent_zone_id: form.parentZoneId || null,
        // Zona nova nasce sem TL próprio: se for filha, herda o da zona-mãe (que é o caso
        // normal); se for de topo, define-se em "Editar" depois de criada.
        team_leader_engineer_id: null,
        active: true,
      });
      setCreating(false);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('zones.createFailed') });
    } finally {
      setSaving(false);
    }
  }

  const topLevelZones = zones.filter((zone) => zone.parent_zone_id === null);

  return (
    <PageShell>
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
        actions={canManageZones && <Button onClick={() => setCreating(true)}>{t('zones.add')}</Button>}
      />

      <Card padded={false} title={t('settings.hierarchy')}>
        {topLevelZones.length === 0 ? (
          <EmptyState
            action={canManageZones ? <Button onClick={() => setCreating(true)}>{t('zones.add')}</Button> : undefined}
          >
            {t('zones.empty')}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {topLevelZones.map((zone) => (
              <ZoneNode key={zone.id} zone={zone} depth={0} allZones={zones} canManageZones={canManageZones} />
            ))}
          </div>
        )}
      </Card>

      {creating && (
        <ZoneFormModal
          t={t}
          zones={zones}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}
    </PageShell>
  );
}
