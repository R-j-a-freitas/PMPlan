import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { SignedDocument, SignedDocumentUpdate } from '../types';

const BUCKET = 'signed-documents';
/** Validade do link de acesso ao PDF. Curta de propósito: são documentos contratuais
 *  assinados, o bucket é privado, e o link só precisa de durar o clique que o abre. */
const SIGNED_URL_TTL_SECONDS = 300;

interface SignedDocumentState {
  documents: SignedDocument[];
  loading: boolean;
  error: string | null;

  fetchSignedDocuments: () => Promise<void>;
  /** URL temporário para abrir/descarregar o PDF (bucket privado — nunca há URL pública).
   *  `download` força a transferência em vez de abrir no browser. */
  getDocumentUrl: (document: SignedDocument, options?: { download?: boolean }) => Promise<string>;
  /** Associa manualmente um documento que chegou sem ser reconhecido. */
  assignToHospital: (id: string, hospitalId: string, userId: string | null) => Promise<void>;
  updateSignedDocument: (id: string, patch: SignedDocumentUpdate) => Promise<void>;
  deleteSignedDocument: (id: string) => Promise<void>;
}

export const useSignedDocumentStore = create<SignedDocumentState>()(
  devtools(
    (set, get) => ({
      documents: [],
      loading: false,
      error: null,

      fetchSignedDocuments: async () => {
        set({ loading: true, error: null });
        const { data, error } = await supabase
          .from('signed_documents')
          .select('*')
          .order('received_at', { ascending: false });
        if (error) {
          set({ loading: false, error: error.message });
          return;
        }
        set({ documents: data, loading: false });
      },

      getDocumentUrl: async (document, options) => {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS, {
            ...(options?.download ? { download: document.filename } : {}),
          });
        if (error || !data?.signedUrl) {
          throw new Error(error?.message ?? 'Não foi possível gerar o link do documento.');
        }
        return data.signedUrl;
      },

      assignToHospital: async (id, hospitalId, userId) => {
        await get().updateSignedDocument(id, {
          hospital_id: hospitalId,
          match_method: 'manual',
          matched_at: new Date().toISOString(),
          matched_by: userId,
        });
      },

      updateSignedDocument: async (id, patch) => {
        const { data, error } = await supabase
          .from('signed_documents')
          .update(patch)
          .eq('id', id)
          .select()
          .single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ documents: get().documents.map((document) => (document.id === id ? data : document)) });
      },

      deleteSignedDocument: async (id) => {
        const target = get().documents.find((document) => document.id === id);
        const { error } = await supabase.from('signed_documents').delete().eq('id', id);
        if (error) {
          set({ error: error.message });
          throw error;
        }
        // O ficheiro sai do Storage a seguir ao registo: se esta segunda operação falhar
        // fica um órfão no bucket, o que é preferível a uma linha a apontar para um
        // ficheiro que já não existe (que seria um erro em cada abertura da ficha).
        if (target) await supabase.storage.from(BUCKET).remove([target.storage_path]);
        set({ documents: get().documents.filter((document) => document.id !== id) });
      },
    }),
    { name: 'signed-document-store' },
  ),
);
