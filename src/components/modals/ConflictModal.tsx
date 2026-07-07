import { format } from 'date-fns';
import type { ConflictResult } from '../../types';
import { Button } from '../ui';

interface ConflictModalProps {
  conflicts: ConflictResult[];
  onAcceptSuggestion: (date: Date) => void;
  onClose: () => void;
}

// Mostra o(s) conflito(s) detectado(s) + sugestão de data alternativa (secção 5).
export function ConflictModal({ conflicts, onAcceptSuggestion, onClose }: ConflictModalProps) {
  const suggestedDate = conflicts.find((conflict) => conflict.suggestedDate)?.suggestedDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-red-700">Conflito ao agendar PM</h2>

        <ul className="mb-4 flex flex-col gap-2">
          {conflicts.map((conflict) => (
            <li
              key={`${conflict.type}-${conflict.message}`}
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {conflict.message}
            </li>
          ))}
        </ul>

        {suggestedDate && (
          <p className="mb-4 text-sm text-gray-700">
            Data alternativa sugerida: <strong>{format(suggestedDate, 'dd/MM/yyyy')}</strong>
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {suggestedDate && (
            <Button variant="primary" onClick={() => onAcceptSuggestion(suggestedDate)}>
              Usar data sugerida
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
