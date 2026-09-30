import { format } from 'date-fns';
import type { ProposedPMEvent } from '../../lib/autoScheduler';
import { toDisplayDate } from '../../lib/dateFormat';
import { Badge } from '../ui';
import { useT } from '../../i18n';
import { conflictMessage } from '../../i18n/labels';

interface RemainingPMsPreviewProps {
  proposals: ProposedPMEvent[];
}

// Pré-visualização das PMs propostas pelo botão "Planear PM" — só leitura; o utilizador
// confirma ou volta atrás no rodapé do PMEventModal.
export function RemainingPMsPreview({ proposals }: RemainingPMsPreviewProps) {
  const t = useT();

  return (
    <div className="flex flex-col gap-2 rounded-md border border-blue-200 bg-blue-50/50 p-3 text-sm">
      <div>
        <p className="font-medium">{t('pm.planRemainingTitle', { count: proposals.length })}</p>
        <p className="text-xs text-gray-500">{t('pm.planRemainingHint')}</p>
      </div>
      <ul className="flex flex-col gap-1">
        {proposals.map((proposal) => {
          const conflict = proposal.conflicts.find((result) => result.hasConflict);
          const start = format(proposal.proposedStartDate, 'yyyy-MM-dd');
          const end = format(proposal.proposedEndDate, 'yyyy-MM-dd');
          return (
            <li key={start} className="flex flex-col">
              <span className="flex items-center gap-2">
                {toDisplayDate(start)} → {toDisplayDate(end)}
                {proposal.requiresManualReview && (
                  <Badge tone="warning" size="sm" title={proposal.adjustmentReason}>
                    {t('pm.planRemainingReview')}
                  </Badge>
                )}
              </span>
              {conflict && <span className="text-xs text-amber-700">{conflictMessage(conflict, t)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
