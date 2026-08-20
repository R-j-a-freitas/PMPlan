import { format } from 'date-fns';
import type { ConflictResult } from '../../types';
import { Button, Modal } from '../ui';

interface ConflictModalProps {
  conflicts: ConflictResult[];
  onAcceptSuggestion: (date: Date) => void;
  onClose: () => void;
}

// Mostra o(s) conflito(s) detectado(s) + sugestão de data alternativa (secção 5).
export function ConflictModal({ conflicts, onAcceptSuggestion, onClose }: ConflictModalProps) {
  const suggestedDate = conflicts.find((conflict) => conflict.suggestedDate)?.suggestedDate;

  return (
    <Modal
      title="Conflito ao agendar PM"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {suggestedDate && (
            <Button onClick={() => onAcceptSuggestion(suggestedDate)}>Usar data sugerida</Button>
          )}
        </>
      }
    >
      <ul className="flex flex-col gap-2">
        {conflicts.map((conflict) => (
          <li
            key={`${conflict.type}-${conflict.message}`}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {conflict.message}
          </li>
        ))}
      </ul>

      {suggestedDate && (
        <p className="mt-4 text-sm text-gray-700">
          Data alternativa sugerida: <strong>{format(suggestedDate, 'dd/MM/yyyy')}</strong>
        </p>
      )}
    </Modal>
  );
}
