export type Engineer = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  primary_zone_id: string | null;
  skills: string[];
  outlook_calendar_id: string | null;
  active: boolean;
  created_at: string;
};

/** Relação many-to-many engineer ↔ zone (um engenheiro pode cobrir múltiplas zonas). */
export type EngineerZone = {
  engineer_id: string;
  zone_id: string;
  is_primary: boolean;
};

/** Engenheiro com as zonas que cobre — usado no selector multi-zona do formulário. */
export type EngineerWithZones = Engineer & {
  zones: EngineerZone[];
};

export type EngineerInsert = Omit<Engineer, 'id' | 'created_at'>;
export type EngineerUpdate = Partial<EngineerInsert>;
