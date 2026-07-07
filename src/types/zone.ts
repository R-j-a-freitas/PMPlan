export type Country = 'PT' | 'ES';

/** Zona geográfica paramétrica — criada e gerida pelo administrador (nunca hardcoded).
 *  Transfronteiriça por natureza: uma zona pode agrupar hospitais de PT e de ES em
 *  simultâneo, por isso não tem `country` próprio — esse campo vive em Hospital.
 *  `type` (não `interface`): o Supabase Database generic exige Record<string, unknown> —
 *  interfaces não têm assinatura de índice implícita, type aliases têm. */
export type Zone = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string;
  /** Zona-mãe (ex: "Northwest" agrupando "Galiza", "Canárias"...) — null = zona de topo. */
  parent_zone_id: string | null;
  active: boolean;
  created_at: string;
};

export type ZoneInsert = Omit<Zone, 'id' | 'created_at'>;
export type ZoneUpdate = Partial<ZoneInsert>;
