import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { ClientProposal, ClientProposalUpdate } from '../types';

interface LogEmailParams {
  proposalId: string | null;
  templateKey: string;
  recipientEmails: string[];
  subject: string;
  sentBy: string | null;
  graphMessageId?: string | null;
}

interface ProposalState {
  proposals: ClientProposal[];
  loading: boolean;
  error: string | null;

  fetchProposals: (year: number) => Promise<void>;
  /** Devolve a proposta existente para hospital+ano, ou cria uma nova em 'draft'. */
  getOrCreateProposal: (hospitalId: string, year: number) => Promise<ClientProposal>;
  updateProposal: (id: string, patch: ClientProposalUpdate) => Promise<void>;
  /** Substitui as PMs associadas à proposta — snapshot do que foi efectivamente incluído
   *  no último envio (a lista "ao vivo" continua a vir do calendário/equipamento). */
  setProposalEvents: (proposalId: string, pmEventIds: string[]) => Promise<void>;
  logEmailSent: (params: LogEmailParams) => Promise<void>;
}

export const useProposalStore = create<ProposalState>()(
  devtools(
    (set, get) => ({
      proposals: [],
      loading: false,
      error: null,

      fetchProposals: async (year) => {
        set({ loading: true, error: null });
        const { data, error } = await supabase.from('client_proposals').select('*').eq('year', year);
        if (error) {
          set({ loading: false, error: error.message });
          return;
        }
        set({ proposals: data, loading: false });
      },

      getOrCreateProposal: async (hospitalId, year) => {
        const existing = get().proposals.find((proposal) => proposal.hospital_id === hospitalId && proposal.year === year);
        if (existing) return existing;

        const { data, error } = await supabase
          .from('client_proposals')
          .insert({ hospital_id: hospitalId, year, stage: 'draft' })
          .select()
          .single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ proposals: [...get().proposals, data] });
        return data;
      },

      updateProposal: async (id, patch) => {
        const { data, error } = await supabase
          .from('client_proposals')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        if (error) {
          set({ error: error.message });
          throw error;
        }
        set({ proposals: get().proposals.map((proposal) => (proposal.id === id ? data : proposal)) });
      },

      setProposalEvents: async (proposalId, pmEventIds) => {
        const { error: deleteError } = await supabase
          .from('client_proposal_events')
          .delete()
          .eq('proposal_id', proposalId);
        if (deleteError) {
          set({ error: deleteError.message });
          throw deleteError;
        }
        if (pmEventIds.length === 0) return;
        const { error: insertError } = await supabase
          .from('client_proposal_events')
          .insert(pmEventIds.map((pmEventId) => ({ proposal_id: proposalId, pm_event_id: pmEventId })));
        if (insertError) {
          set({ error: insertError.message });
          throw insertError;
        }
      },

      logEmailSent: async (params) => {
        const { error } = await supabase.from('email_log').insert({
          proposal_id: params.proposalId,
          template_key: params.templateKey,
          recipient_emails: params.recipientEmails,
          subject: params.subject,
          sent_by: params.sentBy,
          graph_message_id: params.graphMessageId ?? null,
        });
        if (error) {
          set({ error: error.message });
          throw error;
        }
      },
    }),
    { name: 'proposal-store' },
  ),
);
