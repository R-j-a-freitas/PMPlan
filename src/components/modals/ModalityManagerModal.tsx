import { useState } from 'react';
import { APPROVAL_TRACKS } from '../../lib/approvalTrack';
import { useEquipmentStore, useModalityStore, useUiStore } from '../../stores';
import type { ApprovalTrack } from '../../types';
import { Button, EmptyState, Modal } from '../ui';
import { useT } from '../../i18n';
import { APPROVAL_TRACK_KEYS } from '../../i18n/labels';

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
  const t = useT();
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
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('modality.addFailed') });
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
      pushToast({ variant: 'success', message: t('modality.renamed', { name }) });
      setEditingId(null);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('modality.renameFailed') });
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
        message: t('modality.trackChanged', { name, track: t(APPROVAL_TRACK_KEYS[track]) }),
      });
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('modality.trackFailed') });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    setBusy(true);
    try {
      await deleteModality(id, name);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('modality.removeFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t('modality.manageTitle')}
      size="md"
      onClose={onClose}
      description={t('modality.manageHelp')}
      footer={
        <Button onClick={onClose} disabled={busy}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="mb-3 max-h-72 overflow-y-auto rounded-lg border border-gray-200">
        {modalities.length === 0 && <EmptyState size="compact">{t('modality.empty')}</EmptyState>}
        {modalities.map((modality) => (
          <div key={modality.id} className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2 last:border-0">
            {editingId === modality.id ? (
              <>
                <input
                  autoFocus
                  className="pm-field flex-1"
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleRename(modality.name);
                    if (event.key === 'Escape') setEditingId(null);
                  }}
                />
                <Button variant="secondary" size="sm" onClick={() => setEditingId(null)} disabled={busy}>
                  {t('common.cancel')}
                </Button>
                <Button size="sm" onClick={() => handleRename(modality.name)} disabled={busy}>
                  {t('common.save')}
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate text-sm text-gray-800">{modality.name}</span>
                {/* Via de aprovação — ao lado do nome porque é uma propriedade da
                    modalidade, não uma definição escondida noutra página. */}
                <select
                  className="pm-field px-1.5 py-1 text-xs"
                  value={modality.approval_track}
                  disabled={busy}
                  title={t('modality.trackTitle')}
                  onChange={(event) =>
                    handleTrackChange(modality.id, modality.name, event.target.value as ApprovalTrack)
                  }
                >
                  {APPROVAL_TRACKS.map((track) => (
                    <option key={track} value={track}>
                      {t(APPROVAL_TRACK_KEYS[track])}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditingId(modality.id);
                    setEditingName(modality.name);
                  }}
                  disabled={busy}
                >
                  {t('modality.rename')}
                </Button>
                <Button
                  variant="dangerGhost"
                  size="sm"
                  onClick={() => handleDelete(modality.id, modality.name)}
                  disabled={busy}
                >
                  {t('common.remove')}
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          placeholder={t('modality.newPlaceholder')}
          className="pm-field flex-1"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
        />
        <Button onClick={handleAdd} disabled={busy || !newName.trim()}>
          {t('common.add')}
        </Button>
      </div>
    </Modal>
  );
}
