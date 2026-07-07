import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { Country, EmailTemplate, EmailTemplateKey } from '../types';

interface TemplateState {
  templates: EmailTemplate[];
  loading: boolean;
  error: string | null;

  fetchTemplates: () => Promise<void>;
  updateTemplate: (
    key: EmailTemplateKey,
    country: Country,
    subject: string,
    body: string,
    updatedBy: string | null,
  ) => Promise<void>;
}

export const useTemplateStore = create<TemplateState>()(
  devtools(
    (set, get) => ({
      templates: [],
      loading: false,
      error: null,

      fetchTemplates: async () => {
        set({ loading: true, error: null });
        const { data, error } = await supabase.from('email_templates').select('*');
        if (error) {
          set({ loading: false, error: error.message });
          return;
        }
        set({ templates: data, loading: false });
      },

      updateTemplate: async (key, country, subject, body, updatedBy) => {
        const { data, error } = await supabase
          .from('email_templates')
          .update({ subject, body, updated_by: updatedBy, updated_at: new Date().toISOString() })
          .eq('key', key)
          .eq('country', country)
          .select()
          .single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({
          templates: get().templates.map((template) =>
            template.key === key && template.country === country ? data : template,
          ),
        });
      },
    }),
    { name: 'template-store' },
  ),
);
