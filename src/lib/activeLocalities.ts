import type { EquipmentFull, Holiday } from '../types';

export type ActiveLocalities = { pt: Set<string>; es: Set<string> };

// Localidades (concelho PT / Comunidade Autónoma ES) onde existe equipamento real
// instalado — usado para não mostrar feriados de sítios sem nenhuma máquina. Cidades
// espanholas (hospital_city, ex: "Vigo") entram no mesmo conjunto "es": holidays.locality
// guarda tanto códigos de Comunidade Autónoma como nomes de cidade, e o matching é por
// igualdade de string em ambos os casos — não há ambiguidade entre os dois formatos.
export function computeActiveLocalities(equipment: EquipmentFull[]): ActiveLocalities {
  const pt = new Set<string>();
  const es = new Set<string>();
  for (const item of equipment) {
    if (item.hospital_locality) {
      (item.hospital_country === 'PT' ? pt : es).add(item.hospital_locality);
    }
    if (item.hospital_country === 'ES' && item.hospital_city) {
      es.add(item.hospital_city);
    }
  }
  return { pt, es };
}

// Só feriados nacionais, de zona (sempre operacional) ou de localidade com equipamento
// real interessam ao planeamento — os ~300 concelhos/regiões sem nenhuma máquina só
// poluiriam o calendário e o tooltip.
export function filterRelevantHolidays(holidays: Holiday[], active: ActiveLocalities): Holiday[] {
  return holidays.filter((holiday) => {
    if (holiday.zone_id) return true;
    if (!holiday.locality) return true;
    return holiday.country === 'PT' ? active.pt.has(holiday.locality) : active.es.has(holiday.locality);
  });
}
