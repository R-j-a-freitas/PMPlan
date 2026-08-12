import { useState } from 'react';
import { APPROVAL_TRACKS, APPROVAL_TRACK_LABELS } from '../../lib/approvalTrack';
import { useEquipmentStore, useModalityStore, useUiStore } from '../../stores';
import type { ApprovalTrack } from '../../types';
import { Button } from '../ui';

/** Valor-sentinela usado como opção "Editar modalidades…" dentro dos dropdowns de
 *  modalidade — ao ser seleccionado abre este modal em vez de gravar como valor. */
export const MODALITY_MANAGE_VALUE = '__manage_modalities__';

interface ModalityManagerModalProps {
  onClose: () => void;
}

// Gestão das modalidades de equipamento (adicionar/renomear/remover). Renomear usa a RPC
// atómica rename_modality, que propaga o novo nome a equipment.modality na BD; a seguir
// recarrega os equipamentos para a alteração ficar visível de imediato.
export function ModalityManagerModal({ onClose }: ModalityManagerModalProps) {
  const modalities = useModalityStore((state) => state.modalities);
  const createModality = useModalityStore((state) => state.createModality);
  const renameModality = useModalityStore((state) => state.renameModality);
  const setApprovalTrack = useModalityStore((state) => state.setApprovalTrack);
  const deleteModality = useModalityStore((state) => state.deleteModality);
  const fetchEquipment = useEquipmentStore((state) => state.fetchEquipment);
  const pushToast = useUiStore((state) => state.pushToast);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createModality(name);
      setNewName('');
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao adicionar modalidade.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(oldName: string) {
    const name = editingName.trim();
    if (!name || name === oldName) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      await renameModality(oldName, name);
      // Propaga o novo nome aos equipamentos já carregados (a coluna modality é texto livre).
      await fetchEquipment();
      pushToast({ variant: 'success', message: `Modalidade renomeada para "${name}".` });
      setEditingId(null);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao renomear modalidade.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleTrackChange(id: string, name: string, track: ApprovalTrack) {
    setBusy(true);
    try {
      await setApprovalTrack(id, track);
      pushToast({
        variant: 'success',
        message: `"${name}" passa a ser aprovada na via ${APPROVAL_TRACK_LABELS[track]}.`,
      });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao mudar a via.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    setBusy(true);
    try {
      await deleteModality(id, name);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao remover modalidade.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Gerir modalidades</h2>
        <p className="mb-3 text-xs text-gray-500">
          Renomear propaga automaticamente aos equipamentos que a usam. Não é possível remover uma modalidade em uso.
          A <strong>via</strong> decide em que processo de aprovação entram os equipamentos: a via “Braquiterapia”
          gera uma proposta separada da geral, com validação do engenheiro, aprovação do cliente e carta próprias.
        </p>

        <div className="mb-3 max-h-72 overflow-y-auto rounded-md border border-gray-200">
          {modalities.length === 0 && <p className="p-2 text-sm text-gray-500">Sem modalidades registadas.</p>}
          {modalities.map((modality) => (
            <div key={modality.id} className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5 last:border-0">
              {editingId === modality.id ? (
                <>
                  <input
                    autoFocus
                    className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleRename(modality.name);
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                  />
                  <Button onClick={() => handleRename(modality.name)} disabled={busy}>
                    Guardar
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingId(null)} disabled={busy}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800">{modality.name}</span>
                  {/* Via de aprovação — ao lado do nome porque é uma propriedade da
                      modalidade, não uma definição escondida noutra página. */}
                  <select
                    className="rounded-md border border-gray-300 px-1.5 py-1 text-xs"
                    value={modality.approval_track}
                    disabled={busy}
                    title="Via de aprovação dos equipamentos desta modalidade."
                    onChange={(event) =>
                      handleTrackChange(modality.id, modality.name, event.target.value as ApprovalTrack)
                    }
                  >
                    {APPROVAL_TRACKS.map((track) => (
                      <option key={track} value={track}>
                        {APPROVAL_TRACK_LABELS[track]}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(modality.id);
                      setEditingName(modality.name);
                    }}
                    disabled={busy}
                  >
                    Renomear
                  </Button>
                  <Button variant="danger" onClick={() => handleDelete(modality.id, modality.name)} disabled={busy}>
                    Remover
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="mb-4 flex gap-2">
          <input
            placeholder="Nova modalidade"
            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
          />
          <Button variant="secondary" onClick={handleAdd} disabled={busy || !newName.trim()}>
            Adicionar
          </Button>
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose} disabled={busy}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
