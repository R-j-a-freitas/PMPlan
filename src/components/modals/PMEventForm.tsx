import { useState } from 'react';
import { useEngineerStore, useEquipmentStore } from '../../stores';
import type { PMEvent, PMStatus } from '../../types';
import { toDisplayDate } from '../../lib/dateFormat';
import { PM_STATUS_ORDER } from '../../lib/pmStatus';
import { DateInput } from '../ui';
import { useT } from '../../i18n';
import { PM_STATUS_KEYS } from '../../i18n/labels';

interface PMEventFormProps {
  equipmentId: string;
  engineerId: string;
  startDate: string;
  endDate: string;
  status: PMStatus;
  notes: string;
  showStatus: boolean;
  /** Modo só-leitura (engineer/readonly, ou utilizador sem canCreatePM/canEditPM). */
  disabled: boolean;
  /** PMs já planeadas no ano vs. o contratado ("PM/ano" do equipamento), com as próprias
   *  PMs (para a lista expansível de datas) — null enquanto nenhum equipamento está
   *  seleccionado. */
  pmQuota: { count: number; max: number; year: number; dates: PMEvent[] } | null;
  /** Reatribuição em bloco do engenheiro: quantas OUTRAS PMs agendadas do equipamento
   *  passariam a ter o engenheiro escolhido, e em que ano. 0 = não há nada para aplicar
   *  (ou não estamos a editar) e a opção não aparece. */
  applyEngineerToAllCount: number;
  applyEngineerToAllYear: number;
  applyEngineerToAll: boolean;
  onEquipmentChange: (id: string) => void;
  onEngineerChange: (id: string) => void;
  onApplyEngineerToAllChange: (value: boolean) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onStatusChange: (status: PMStatus) => void;
  onNotesChange: (value: string) => void;
}

export function PMEventForm(props: PMEventFormProps) {
  const t = useT();
  const equipment = useEquipmentStore((state) => state.equipment);
  const engineers = useEngineerStore((state) => state.engineers);
  const [datesExpanded, setDatesExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {t('common.equipment')}
        <select
          className="pm-field disabled:bg-gray-100"
          value={props.equipmentId}
          disabled={props.disabled}
          onChange={(event) => props.onEquipmentChange(event.target.value)}
        >
          <option value="">{t('pm.selectPlaceholder')}</option>
          {equipment.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.hospital_name}
            </option>
          ))}
        </select>
      </label>

      {props.pmQuota && (
        <div className="-mt-2">
          <button
            type="button"
            className={`flex items-center gap-1 text-xs ${
              props.pmQuota.count >= props.pmQuota.max ? 'font-medium text-red-600' : 'text-gray-500'
            } ${props.pmQuota.dates.length === 0 ? 'cursor-default' : 'hover:underline'}`}
            onClick={() => setDatesExpanded((expanded) => !expanded)}
            disabled={props.pmQuota.dates.length === 0}
          >
            {props.pmQuota.dates.length > 0 && <span>{datesExpanded ? '▾' : '▸'}</span>}
            {t('pm.plannedInYear', {
              year: props.pmQuota.year,
              count: props.pmQuota.count,
              max: props.pmQuota.max,
            })}
          </button>
          {datesExpanded && props.pmQuota.dates.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 border-l-2 border-gray-200 pl-2 text-xs text-gray-500">
              {props.pmQuota.dates.map((event) => {
                const statusKey = PM_STATUS_KEYS[event.status];
                const statusLabel = statusKey ? t(statusKey) : null;
                return (
                  <li key={event.id}>
                    {toDisplayDate(event.start_date)} → {toDisplayDate(event.end_date)}
                    {statusLabel && ` — ${statusLabel}`}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        {t('common.engineer')}
        <select
          className="pm-field disabled:bg-gray-100"
          value={props.engineerId}
          disabled={props.disabled}
          onChange={(event) => props.onEngineerChange(event.target.value)}
        >
          <option value="">{t('pm.selectPlaceholder')}</option>
          {engineers.map((engineer) => (
            <option key={engineer.id} value={engineer.id}>
              {engineer.name}
            </option>
          ))}
        </select>
      </label>

      {props.applyEngineerToAllCount > 0 && !props.disabled && (
        <label className="-mt-2 flex cursor-pointer items-start gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={props.applyEngineerToAll}
            onChange={(event) => props.onApplyEngineerToAllChange(event.target.checked)}
          />
          <span>
            {t('pm.applyEngineerToAll', {
              count: props.applyEngineerToAllCount,
              year: props.applyEngineerToAllYear,
            })}
            <span className="mt-0.5 block text-gray-400">{t('pm.applyEngineerToAllHint')}</span>
          </span>
        </label>
      )}

      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t('common.start')}
          <DateInput value={props.startDate} disabled={props.disabled} onChange={props.onStartDateChange} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t('common.end')}
          <DateInput value={props.endDate} disabled={props.disabled} onChange={props.onEndDateChange} />
        </label>
      </div>

      {props.showStatus && (
        <label className="flex flex-col gap-1 text-sm">
          {t('common.status')}
          <select
            className="pm-field disabled:bg-gray-100"
            value={props.status}
            disabled={props.disabled}
            onChange={(event) => props.onStatusChange(event.target.value as PMStatus)}
          >
            {PM_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {t(PM_STATUS_KEYS[value])}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        {t('common.notes')}
        <textarea
          className="pm-field disabled:bg-gray-100"
          rows={2}
          value={props.notes}
          disabled={props.disabled}
          onChange={(event) => props.onNotesChange(event.target.value)}
        />
      </label>
    </div>
  );
}
