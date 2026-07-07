import type { Zone } from '../../types';

interface ZoneMultiSelectProps {
  zones: Zone[];
  selectedZoneIds: string[];
  primaryZoneId: string;
  onChange: (zoneIds: string[], primaryZoneId: string) => void;
}

// Selecção de múltiplas zonas para um engenheiro (secção: "este engenheiro está a
// cobrir duas zonas") + escolha de qual delas é a principal, quando há mais que uma.
export function ZoneMultiSelect({ zones, selectedZoneIds, primaryZoneId, onChange }: ZoneMultiSelectProps) {
  function toggleZone(zoneId: string, checked: boolean) {
    const newZoneIds = checked ? [...selectedZoneIds, zoneId] : selectedZoneIds.filter((id) => id !== zoneId);
    const newPrimary = newZoneIds.includes(primaryZoneId) ? primaryZoneId : (newZoneIds[0] ?? '');
    onChange(newZoneIds, newPrimary);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex max-h-28 w-44 flex-col gap-0.5 overflow-y-auto rounded-md border border-gray-300 p-1.5">
        {zones.map((zone) => (
          <label key={zone.id} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={selectedZoneIds.includes(zone.id)}
              onChange={(event) => toggleZone(zone.id, event.target.checked)}
            />
            {zone.name}
          </label>
        ))}
        {zones.length === 0 && <span className="text-xs text-gray-400">Sem zonas criadas.</span>}
      </div>
      {selectedZoneIds.length > 1 && (
        <select
          className="rounded-md border border-gray-300 px-2 py-1 text-xs"
          value={primaryZoneId}
          onChange={(event) => onChange(selectedZoneIds, event.target.value)}
        >
          {selectedZoneIds.map((id) => {
            const zone = zones.find((candidate) => candidate.id === id);
            return zone ? (
              <option key={id} value={id}>
                Principal: {zone.name}
              </option>
            ) : null;
          })}
        </select>
      )}
    </div>
  );
}
