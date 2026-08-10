import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { EmailRecipient } from '../types';

interface EmailRecipientState {
  recipients: EmailRecipient[];
  loading: boolean;
  error: string | null;

  fetchRecipients: () => Promise<void>;
  /** Adiciona um destinatário (email obrigatório, nome opcional). Já activo por omissão. */
  createRecipient: (email: string, name?: string) => Promise<void>;
  /** Liga/desliga o destinatário do loop de emails sem apagar o registo. */
  setActive: (id: string, active: boolean) => Promise<void>;
  deleteRecipient: (id: string) => Promise<void>;
}

export const useEmailRecipientStore = create<EmailRecipientState>()(
  devtools(
    (set, get) => ({
      recipients: [],
      loading: false,
      error: null,

      fetchRecipients: async () => {
        set({ loading: true, error: null });
        const { data, error } = await supabase.from('email_recipients').select('*').order('sort_order').order('email');
        if (error) {
          set({ loading: false, error: error.message });
          return;
        }
        set({ recipients: data, loading: false });
      },

      createRecipient: async (email, name) => {
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail) return;
        const trimmedName = name?.trim() || null;
        const nextOrder = get().recipients.reduce((max, recipient) => Math.max(max, recipient.sort_order), 0) + 1;
        const { data, error } = await supabase
          .from('email_recipients')
          .insert({ email: trimmedEmail, name: trimmedName, active: true, sort_order: nextOrder })
          .select()
          .single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ recipients: [...get().recipients, data] });
      },

      setActive: async (id, active) => {
        const { data, error } = await supabase.from('email_recipients').update({ active }).eq('id', id).select().single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ recipients: get().recipients.map((recipient) => (recipient.id === id ? data : recipient)) });
      },

      deleteRecipient: async (id) => {
        const { error } = await supabase.from('email_recipients').delete().eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ recipients: get().recipients.filter((recipient) => recipient.id !== id) });
      },
    }),
    { name: 'email-recipient-store' },
  ),
);
