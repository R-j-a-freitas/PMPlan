import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { HospitalContact, HospitalContactInsert, HospitalContactUpdate } from '../types';

/** Contactos dos clientes (tabela `hospital_contacts`, migração 0021).
 *
 *  Store própria e não um campo do hospital: os contactos deixaram de viver no jsonb
 *  `hospitals.contacts`, e três páginas precisam deles sem precisar de tudo o resto —
 *  Contactos (lista consolidada), Hospitais (coluna e modal) e Aprovações (destinatários
 *  filtrados pela via). O nome do hospital não vem daqui: junta-se com a lista da
 *  hospitalStore, que essas páginas já carregam. */
interface ContactState {
  contacts: HospitalContact[];
  loading: boolean;
  error: string | null;

  fetchContacts: () => Promise<void>;
  createContact: (contact: HospitalContactInsert) => Promise<void>;
  bulkCreateContacts: (
    rows: { rowNumber: number; data: HospitalContactInsert }[],
  ) => Promise<{ success: number; errors: { rowNumber: number; message: string }[] }>;
  updateContact: (id: string, patch: HospitalContactUpdate) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
}

export const useContactStore = create<ContactState>()(
  devtools(
    (set, get) => ({
      contacts: [],
      loading: false,
      error: null,

      fetchContacts: async () => {
        set({ loading: true, error: null });
        const { data, error } = await supabase
          .from('hospital_contacts')
          .select('*')
          .order('name');
        if (error) {
          set({ loading: false, error: error.message });
          return;
        }
        set({ contacts: data as HospitalContact[], loading: false });
      },

      createContact: async (contact) => {
        const { error } = await supabase.from('hospital_contacts').insert(contact);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        await get().fetchContacts();
      },

      // Linha a linha (mesmo padrão de bulkCreateHospital): um ficheiro com uma linha má
      // não pode fazer cair as boas, e quem importa precisa de saber QUE linhas falharam.
      bulkCreateContacts: async (rows) => {
        const errors: { rowNumber: number; message: string }[] = [];
        let success = 0;
        for (const { rowNumber, data } of rows) {
          const { error } = await supabase.from('hospital_contacts').insert(data);
          if (error) errors.push({ rowNumber, message: error.message });
          else success++;
        }
        await get().fetchContacts();
        return { success, errors };
      },

      updateContact: async (id, patch) => {
        // updated_at é escrito aqui e não por trigger — mesma convenção de pm_events e
        // client_proposals (ver migração 0021).
        const { error } = await supabase
          .from('hospital_contacts')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        await get().fetchContacts();
      },

      deleteContact: async (id) => {
        const { error } = await supabase.from('hospital_contacts').delete().eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ contacts: get().contacts.filter((contact) => contact.id !== id) });
      },
    }),
    { name: 'contact-store' },
  ),
);
