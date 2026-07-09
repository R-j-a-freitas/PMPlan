import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useBulkAutoScheduler } from '../../hooks/useBulkAutoScheduler';
import type { BulkSchedulerResult } from '../../hooks/useBulkAutoScheduler';
import type { ProposedPMEvent } from '../../lib/autoScheduler';
import { useAuthStore, useCalendarStore, useEngineerStore, useEquipmentStore, useUiStore, useZoneStore } from '../../stores';
import type { PMEventInsert } from '../../types';
import { Badge, Button } from '../ui';

interface AutoSchedulerModalProps {
  defaultYear: number;
  onClose: () => void;
}

type Phase = 'setup' | 'generating' | 'review';

function formatDate(date: Date) {
  return format(date, 'dd/MM/yyyy', { locale: pt });
}

// Linha individual de proposta PM (dentro do card de cada equipamento)
function ProposalRow({
  proposal,
  index,
  missingEngineer,
}: {
  proposal: ProposedPMEvent;
  index: number;
  missingEngineer: boolean;
}) {
  const hasConflicts = proposal.conflicts.length > 0;
  const needsReview = proposal.requiresManualReview;

  return (
    <div
      className={`flex items-start gap-3 rounded-md border px-3 py-2 text-sm ${
        needsReview
          ? 'border-red-200 bg-red-50'
          : hasConflicts
            ? 'border-amber-200 bg-amber-50'
            : 'border-green-100 bg-green-50'
      }`}
    >
      <span className="mt-0.5 shrink-0 font-mono text-xs text-gray-500">PM {index + 1}</span>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-800">
            {formatDate(proposal.proposedStartDate)} → {formatDate(proposal.proposedEndDate)}
          </span>
          {proposal.anchorSource === 'historical' && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
              ancorado no histórico
            </span>
          )}
          {proposal.anchorSource === 'base_distribution' && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              distribuição base
            </span>
          )}
          {missingEngineer && (
            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600">
              sem engenheiro
            </span>
          )}
          {needsReview && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
              revisão manual necessária
            </span>
          )}
        </div>
        {proposal.previousActualDate && (
          <div className="mt-0.5 text-xs text-gray-500">
            Anterior: {formatDate(proposal.previousActualDate)} · intervalo proposto: {proposal.intervalDays} dias
          </div>
        )}
        {proposal.adjustmentReason && (
          <div className="mt-0.5 text-xs text-amber-700">{proposal.adjustmentReason}</div>
        )}
        {proposal.conflicts.map((c, ci) => (
          <div key={ci} className="mt-0.5 text-xs text-red-700">
            {c.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// Card de resultado por equipamento
function EquipmentResultCard({
  result,
  selected,
  onToggle,
  validEngineerIds,
}: {
  result: BulkSchedulerResult;
  selected: boolean;
  onToggle: () => void;
  validEngineerIds: Set<string>;
}) {
  const hasAnyConflict = result.proposals.some((p) => p.requiresManualReview || p.conflicts.length > 0);
  const allOk = !hasAnyConflict && result.proposals.length > 0;

  return (
    <div
      className={`rounded-lg border ${selected ? 'border-blue-300 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'}`}
    >
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={!!result.error || result.proposals.length === 0}
          className="h-4 w-4 rounded border-gray-300"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900 truncate">{result.equipmentName}</span>
            <Badge color={result.zoneColor}>{result.zoneCode}</Badge>
            <span className="text-sm text-gray-500">{result.hospitalName}</span>
          </div>
          {result.comparison && (
            <div className="mt-0.5 text-xs text-gray-500">
              Coerência: {result.comparison.coherenceScore}% · intervalo médio proposto:{' '}
              {result.comparison.proposedAverageIntervalDays} dias
            </div>
          )}
        </div>
        <div className="shrink-0">
          {result.error ? (
            <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">Erro</span>
          ) : allOk ? (
            <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
              {result.proposals.length} PMs · sem conflitos
            </span>
          ) : (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              {result.proposals.filter((p) => p.requiresManualReview || p.conflicts.length > 0).length} com alertas
            </span>
          )}
        </div>
      </div>
      <div className="space-y-2 px-4 py-3">
        {result.error ? (
          <p className="text-sm text-red-600">{result.error}</p>
        ) : result.proposals.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma proposta gerada.</p>
        ) : (
          result.proposals.map((p, i) => (
            <ProposalRow
              key={i}
              proposal={p}
              index={i}
              missingEngineer={!validEngineerIds.has(p.engineerId)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function AutoSchedulerModal({ defaultYear, onClose }: AutoSchedulerModalProps) {
  const equipment = useEquipmentStore((state) => state.equipment);
  const engineers = useEngineerStore((state) => state.engineers);
  const zones = useZoneStore((state) => state.zones);
  const fetchYearEvents = useCalendarStore((state) => state.fetchYearEvents);
  const createBulkEvents = useCalendarStore((state) => state.createBulkEvents);
  const canCreatePM = useAuthStore((state) => state.permissions.canCreatePM);
  const pushToast = useUiStore((state) => state.pushToast);

  const { generating, progress, results, generate, reset } = useBulkAutoScheduler();

  const [phase, setPhase] = useState<Phase>('setup');
  const [targetYear, setTargetYear] = useState(defaultYear);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<Set<string>>(new Set());
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const activeEquipment = useMemo(
    () => equipment.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name)),
    [equipment],
  );

  // Ids de engenheiros reais — propostas cujo engineerId não resolve (vazio ou obsoleto)
  // são marcadas "sem engenheiro" na revisão e gravadas com engineer_id null.
  const validEngineerIds = useMemo(() => new Set(engineers.map((e) => e.id)), [engineers]);

  // Pré-seleccionar todos os equipamentos activos ao abrir o modal
  useEffect(() => {
    setSelectedEquipmentIds(new Set(activeEquipment.map((e) => e.id)));
  }, [activeEquipment]);

  // Após gerar, pré-seleccionar todos os resultados sem erro para guardar
  useEffect(() => {
    if (results.length > 0) {
      setSelectedResults(
        new Set(results.filter((r) => !r.error && r.proposals.length > 0).map((r) => r.equipmentId)),
      );
    }
  }, [results]);

  // Equipamentos agrupados por zona
  const byZone = useMemo(() => {
    const map = new Map<string, { zoneName: string; zoneColor: string; items: typeof activeEquipment }>();
    for (const eq of activeEquipment) {
      const zoneId = eq.zone_id;
      if (!map.has(zoneId)) {
        const zone = zones.find((z) => z.id === zoneId);
        map.set(zoneId, { zoneName: zone?.name ?? eq.zone_name, zoneColor: eq.zone_color, items: [] });
      }
      map.get(zoneId)!.items.push(eq);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => a.zoneName.localeCompare(b.zoneName));
  }, [activeEquipment, zones]);

  function toggleZone(zoneId: string, items: typeof activeEquipment) {
    const ids = items.map((e) => e.id);
    const allSelected = ids.every((id) => selectedEquipmentIds.has(id));
    setSelectedEquipmentIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  async function handleGenerate() {
    if (selectedEquipmentIds.size === 0) return;
    // Garantir que os yearEvents estão actualizados para o ano alvo
    await fetchYearEvents(targetYear);
    setPhase('generating');
    await generate({ equipmentIds: Array.from(selectedEquipmentIds), targetYear });
    setPhase('review');
  }

  async function handleSave() {
    if (!canCreatePM) return;
    setSaving(true);
    try {
      const toSave: PMEventInsert[] = [];
      let withoutEngineer = 0;
      for (const result of results) {
        if (!selectedResults.has(result.equipmentId)) continue;
        for (const proposal of result.proposals) {
          // Proposta sem engenheiro resolúvel: guarda na mesma com engineer_id null
          // (em vez de descartar silenciosamente) — o utilizador atribui depois.
          const hasEngineer = validEngineerIds.has(proposal.engineerId);
          if (!hasEngineer) withoutEngineer++;
          const baseNotes = proposal.adjustmentReason
            ? `Gerado automaticamente. ${proposal.adjustmentReason}`
            : 'Gerado automaticamente.';
          toSave.push({
            equipment_id: proposal.equipmentId,
            engineer_id: hasEngineer ? proposal.engineerId : null,
            start_date: format(proposal.proposedStartDate, 'yyyy-MM-dd'),
            end_date: format(proposal.proposedEndDate, 'yyyy-MM-dd'),
            actual_start_date: null,
            actual_end_date: null,
            status: 'planned',
            outlook_event_id: null,
            notes: hasEngineer
              ? baseNotes
              : `${baseNotes} Sem engenheiro atribuído — requer atribuição manual.`,
          });
        }
      }

      if (toSave.length === 0) {
        pushToast({ variant: 'warning', message: 'Nenhum evento seleccionado para guardar.' });
        return;
      }

      await createBulkEvents(toSave);
      const successMessage = `${toSave.length} PM(s) criada(s) com sucesso para o plano ${targetYear}.`;
      if (withoutEngineer > 0) {
        pushToast({
          variant: 'warning',
          message: `${successMessage} (${withoutEngineer} sem engenheiro atribuído — atribui-os manualmente no calendário)`,
        });
      } else {
        pushToast({ variant: 'success', message: successMessage });
      }
      onClose();
    } catch (err) {
      pushToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Falha ao guardar os eventos.',
      });
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    reset();
    setPhase('setup');
  }

  const totalProposals = results.reduce((sum, r) => sum + r.proposals.length, 0);
  const totalConflicts = results.reduce(
    (sum, r) => sum + r.proposals.filter((p) => p.requiresManualReview || p.conflicts.length > 0).length,
    0,
  );
  const savedCount = results
    .filter((r) => selectedResults.has(r.equipmentId))
    .reduce((sum, r) => sum + r.proposals.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Geração Automática de Plano Anual</h2>
            {phase === 'setup' && (
              <p className="mt-0.5 text-sm text-gray-500">
                Selecciona os equipamentos e o ano para gerar propostas de PM com base no histórico real.
              </p>
            )}
            {phase === 'review' && (
              <p className="mt-0.5 text-sm text-gray-500">
                {totalProposals} propostas · {totalConflicts > 0 ? `${totalConflicts} com alertas · ` : ''}
                {savedCount} seleccionadas para guardar
              </p>
            )}
          </div>
          <button
            className="text-gray-400 hover:text-gray-600"
            onClick={onClose}
            disabled={generating || saving}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto">
          {/* FASE 1: Setup */}
          {phase === 'setup' && (
            <div className="p-6 space-y-5">
              {/* Ano alvo */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 w-32">Ano do plano</label>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
                    onClick={() => setTargetYear((y) => y - 1)}
                  >
                    ‹
                  </button>
                  <span className="min-w-[4rem] text-center text-sm font-semibold text-gray-800">{targetYear}</span>
                  <button
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
                    onClick={() => setTargetYear((y) => y + 1)}
                  >
                    ›
                  </button>
                </div>
              </div>

              {/* Selecção de equipamentos */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Equipamentos</span>
                  <div className="flex gap-2">
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => setSelectedEquipmentIds(new Set(activeEquipment.map((e) => e.id)))}
                    >
                      Todos
                    </button>
                    <span className="text-xs text-gray-300">|</span>
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => setSelectedEquipmentIds(new Set())}
                    >
                      Nenhum
                    </button>
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-gray-200 p-3">
                  {byZone.map(([zoneId, { zoneName, zoneColor, items }]) => {
                    const allZoneSelected = items.every((e) => selectedEquipmentIds.has(e.id));
                    const someZoneSelected = items.some((e) => selectedEquipmentIds.has(e.id));
                    return (
                      <div key={zoneId}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
                          <input
                            type="checkbox"
                            checked={allZoneSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = !allZoneSelected && someZoneSelected;
                            }}
                            onChange={() => toggleZone(zoneId, items)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: zoneColor }}
                          />
                          {zoneName}
                        </label>
                        <div className="ml-6 mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
                          {items.map((eq) => (
                            <label key={eq.id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                              <input
                                type="checkbox"
                                checked={selectedEquipmentIds.has(eq.id)}
                                onChange={() => {
                                  setSelectedEquipmentIds((prev) => {
                                    const next = new Set(prev);
                                    next.has(eq.id) ? next.delete(eq.id) : next.add(eq.id);
                                    return next;
                                  });
                                }}
                                className="h-3.5 w-3.5 rounded border-gray-300"
                              />
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: eq.color }}
                              />
                              <span className="truncate">{eq.name}</span>
                              <span className="shrink-0 text-xs text-gray-400">({eq.pm_per_year}×/ano)</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {activeEquipment.length === 0 && (
                    <p className="py-4 text-center text-sm text-gray-400">Sem equipamentos activos.</p>
                  )}
                </div>
              </div>

              {/* Nota informativa */}
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                <strong>Como funciona:</strong> Para cada equipamento, o algoritmo ancora as datas do plano{' '}
                {targetYear} nas datas <em>reais</em> de execução de {targetYear - 1} (Regra 6). Quando não
                existe histórico, usa a distribuição base (Jan/Abr/Jul/Out para 4 PMs). Nunca gera conflitos de
                engenheiro (R1), feriados (R2) ou fins-de-semana não contratualizados (R5).
              </div>
            </div>
          )}

          {/* FASE 2: A gerar */}
          {phase === 'generating' && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              <p className="text-sm font-medium text-gray-700">
                A processar {progress.current} de {progress.total} equipamento(s)…
              </p>
              <div className="w-64 rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* FASE 3: Revisão */}
          {phase === 'review' && (
            <div className="space-y-3 p-6">
              {totalConflicts > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <strong>{totalConflicts} proposta(s) com alertas</strong> — marcadas a laranja/vermelho abaixo.
                  Podes guardar na mesma (ficam com status <em>planned</em>) e corrigir manualmente no calendário.
                </div>
              )}
              {results.map((result) => (
                <EquipmentResultCard
                  key={result.equipmentId}
                  result={result}
                  validEngineerIds={validEngineerIds}
                  selected={selectedResults.has(result.equipmentId)}
                  onToggle={() => {
                    setSelectedResults((prev) => {
                      const next = new Set(prev);
                      next.has(result.equipmentId) ? next.delete(result.equipmentId) : next.add(result.equipmentId);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Rodapé com acções */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <div>
            {phase === 'review' && (
              <Button variant="secondary" onClick={handleBack} disabled={saving}>
                ← Voltar a seleccionar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={generating || saving}>
              Cancelar
            </Button>
            {phase === 'setup' && (
              <Button
                onClick={handleGenerate}
                disabled={selectedEquipmentIds.size === 0}
              >
                Gerar propostas ({selectedEquipmentIds.size})
              </Button>
            )}
            {phase === 'review' && (
              <Button
                onClick={handleSave}
                disabled={saving || savedCount === 0 || !canCreatePM}
              >
                {saving ? 'A guardar…' : `Confirmar e guardar (${savedCount} PM${savedCount !== 1 ? 's' : ''})`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
