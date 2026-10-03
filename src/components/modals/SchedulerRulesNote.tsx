import type { TFunction, TranslationKey } from '../../i18n';

interface SchedulerRulesNoteProps {
  t: TFunction;
  year: number;
}

// Nota do AutoSchedulerModal: o resumo fica sempre à vista; as regras todas ficam num
// <details> fechado por omissão, para não empurrar a lista de equipamentos para baixo.
// O texto vem do dicionário (scheduler.rules.*), que descreve lib/autoScheduler.ts,
// hooks/useBulkAutoScheduler.ts e lib/conflictRules.ts.
const SECTIONS: { title: TranslationKey; items: TranslationKey[] }[] = [
  {
    title: 'scheduler.rules.anchor.title',
    items: ['scheduler.rules.anchor.current', 'scheduler.rules.anchor.history', 'scheduler.rules.anchor.base'],
  },
  {
    title: 'scheduler.rules.block.title',
    items: [
      'scheduler.rules.block.r1',
      'scheduler.rules.block.r2',
      'scheduler.rules.block.r5',
      'scheduler.rules.block.r7',
      'scheduler.rules.block.r8',
      'scheduler.rules.block.year',
    ],
  },
  {
    title: 'scheduler.rules.spacing.title',
    items: ['scheduler.rules.spacing.min', 'scheduler.rules.spacing.r4'],
  },
  {
    title: 'scheduler.rules.conflict.title',
    items: ['scheduler.rules.conflict.weeks', 'scheduler.rules.conflict.days', 'scheduler.rules.conflict.manual'],
  },
  {
    title: 'scheduler.rules.batch.title',
    items: [
      'scheduler.rules.batch.count',
      'scheduler.rules.batch.cross',
      'scheduler.rules.batch.replace',
      'scheduler.rules.batch.proposal',
    ],
  },
];

export function SchedulerRulesNote({ t, year }: SchedulerRulesNoteProps) {
  const params = { year, previousYear: year - 1 };
  return (
    <div className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-xs text-brand-800">
      <p>
        <strong>{t('scheduler.howItWorksTitle')}</strong> {t('scheduler.howItWorks', params)}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer font-semibold text-brand-700 hover:text-brand-900">
          {t('scheduler.rules.toggle')}
        </summary>
        <div className="mt-2 flex flex-col gap-3">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h4 className="mb-1 font-semibold text-brand-900">{t(section.title)}</h4>
              <ul className="list-disc space-y-1 pl-4">
                {section.items.map((item) => (
                  <li key={item}>{t(item, params)}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}
