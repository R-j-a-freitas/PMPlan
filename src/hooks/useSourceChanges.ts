import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SourceChange, SourceChangeInsert, SourceChangeUpdate } from '../types';

interface UseSourceChangesResult {
  sourceChanges: SourceChange[];
  loading: boolean;
  error: string | null;
  createSourceChange: (entry: SourceChangeInsert) => Promise<void>;
  updateSourceChange: (id: string, patch: SourceChangeUpdate) => Promise<void>;
  refresh: () => Promise<void>;
}

// Específico de Braquiterapia (secção 1) — sem store dedicada na arquitectura base;
// fica num hook para respeitar a regra 5 (sem queries Supabase directas em componentes).
export function useSourceChanges(equipmentId: string | null): UseSourceChangesResult {
  const [sourceChanges, setSourceChanges] = useState<SourceChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!equipmentId) {
      setSourceChanges([]);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('source_changes')
      .select('*')
      .eq('equipment_id', equipmentId)
      .order('planned_date', { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }
    setSourceChanges(data);
    setLoading(false);
  }, [equipmentId]);

  useEffect(() => {
    refresh().catch((err: unknown) => {
      console.error('useSourceChanges: falha ao carregar', err);
    });
  }, [refresh]);

  const createSourceChange = useCallback(
    async (entry: SourceChangeInsert) => {
      const { error: insertError } = await supabase.from('source_changes').insert(entry);
      if (insertError) throw insertError;
      await refresh();
    },
    [refresh],
  );

  const updateSourceChange = useCallback(
    async (id: string, patch: SourceChangeUpdate) => {
      const { error: updateError } = await supabase
        .from('source_changes')
        .update(patch)
        .eq('id', id);
      if (updateError) throw updateError;
      await refresh();
    },
    [refresh],
  );

  return { sourceChanges, loading, error, createSourceChange, updateSourceChange, refresh };
}
