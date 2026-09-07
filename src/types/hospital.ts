import type { Country } from './zone';
import type { ApprovalTrack } from './clientProposal';

/** Contacto guardado no jsonb `hospitals.contacts`.
 *
 *  OBSOLETO desde a migração 0021 — os contactos passaram para a tabela própria
 *  `hospital_contacts` (ver HospitalContact abaixo). O tipo e a coluna ficam enquanto a
 *  coluna não for apagada; nada na aplicação a lê. */
export type LegacyHospitalContact = {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
};

/** Contacto do cliente — linha da tabela `hospital_contacts` (migração 0021).
 *
 *  Ao contrário do jsonb que substituiu, tem id próprio (editar/apagar deixa de depender
 *  da posição num array), campos para móvel e fax, e sobretudo uma **via**: quem valida a
 *  braquiterapia de um hospital não é necessariamente quem valida o resto. */
export type HospitalContact = {
  id: string;
  hospital_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  /** Via a que o contacto responde. **null = serve as duas** — é o caso normal, e só se
   *  preenche quando o hospital tem mesmo interlocutores diferentes. Filtrar sempre com
   *  "track === null || track === via". */
  approval_track: ApprovalTrack | null;
  /** Destinatário preferencial da carta nesta via. Sem exclusividade garantida. */
  is_primary: boolean;
  /** Falso tira o contacto dos envios sem apagar o registo. */
  active: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Campos com valor por omissão na BD (is_primary, active, sort_order) ficam opcionais. */
export type HospitalContactInsert = Omit<
  HospitalContact,
  'id' | 'created_at' | 'updated_at' | 'is_primary' | 'active' | 'sort_order'
> & {
  is_primary?: boolean;
  active?: boolean;
  sort_order?: number;
};

/** hospital_id entra aqui: o formulário de edição deixa mudar o contacto de hospital.
 *  updated_at é escrito pela store (não há trigger — ver migração 0021). */
export type HospitalContactUpdate = Partial<HospitalContactInsert> & { updated_at?: string };

/** Hospital/cliente — a origem da hierarquia de zonas (equipment.zone_id deriva daqui).
 *  country fica aqui, não na zona: a mesma zona pode agrupar hospitais de PT e de ES. */
export type Hospital = {
  id: string;
  name: string;
  short_name: string | null;
  address: string | null;
  /** Código postal da morada (ex: "28040"). */
  postal_code: string | null;
  /** Nome tal como deve aparecer na carta de calendarização. Null = usa `name`. Não
   *  confundir com short_name, que é o rótulo curto do calendário. */
  letter_name: string | null;
  /** ID do cliente no sistema da Elekta — chave estável para cruzar ficheiros externos
   *  com a base de dados, onde os nomes se escrevem de maneira diferente em cada lista. */
  elekta_id: string | null;
  country: Country;
  /** Concelho (PT, texto livre, ex: "Braga") ou Comunidade Autónoma no formato ISO
   *  3166-2 da Nager.Date (ES, ex: "ES-GA" Galiza) — casa com holidays.locality para
   *  feriados municipais/regionais oficiais. */
  locality: string | null;
  /** Cidade/concelho espanhol (ex: "Vigo") — "fiestas locales" próprias do município,
   *  distintas do feriado regional da Comunidade Autónoma (locality acima). PT não usa
   *  este campo: locality já é o concelho. */
  city: string | null;
  zone_id: string;
  /** OBSOLETO — ver LegacyHospitalContact. Os contactos vivem em `hospital_contacts`. */
  contacts: LegacyHospitalContact[];
  active: boolean;
  created_at: string;
};

/** Linha da view `hospitals_with_zone` — usar sempre esta view nas queries do frontend. */
export type HospitalWithZone = Hospital & {
  zone_name: string;
  zone_code: string;
  zone_color: string;
};

/** Os campos que vieram da migração 0021 são opcionais na criação: quem cria um hospital
 *  no formulário não os preenche, e a coluna aceita null. */
export type HospitalInsert = Omit<
  Hospital,
  'id' | 'created_at' | 'postal_code' | 'letter_name' | 'elekta_id'
> &
  Partial<Pick<Hospital, 'postal_code' | 'letter_name' | 'elekta_id'>>;

export type HospitalUpdate = Partial<HospitalInsert>;
