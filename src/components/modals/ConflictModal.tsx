import { format } from 'date-fns';
import type { ConflictResult } from '../../types';
import { Button, Modal } from '../ui';
import { useT } from '../../i18n';
import { conflictMessage } from '../../i18n/labels';

interface ConflictModalProps {
  conflicts: ConflictResult[];
  onAcceptSuggestion: (date: Date) => void;
  onClose: () => void;
}

// Mostra o(s) conflito(s) detectado(s) + sugestão de data alternativa (secção 5).
export function ConflictModal({ conflicts, onAcceptSuggestion, onClose }: ConflictModalProps) {
  const t = useT();
  const suggestedDate = conflicts.find((conflict) => conflict.suggestedDate)?.suggestedDate;

  return (
    <Modal
      title={t('conflict.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {suggestedDate && (
            <Button onClick={() => onAcceptSuggestion(suggestedDate)}>{t('conflict.useSuggested')}</Button>
          )}
        </>
      }
    >
      <ul className="flex flex-col gap-2">
        {conflicts.map((conflict, index) => (
          <li
            key={`${conflict.type}-${conflict.messageKey}-${index}`}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {conflictMessage(conflict, t)}
          </li>
        ))}
      </ul>

      {suggestedDate && (
        <p className="mt-4 text-sm text-gray-700">
          {t('conflict.suggestedDate')} <strong>{format(suggestedDate, 'dd/MM/yyyy')}</strong>
        </p>
      )}
    </Modal>
  );
}
