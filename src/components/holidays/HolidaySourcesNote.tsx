import type { ReactNode } from 'react';
import { toDisplayDate } from '../../lib/dateFormat';
import {
  BOE_SEARCH_URL,
  boeResolutionUrl,
  CATALONIA_CALENDAR_URL,
  nagerUrl,
  PT_HOLIDAYS_URL,
  PT_MUNICIPAL_HOLIDAYS_URL,
} from '../../lib/holidayReferenceLinks';
import type { TFunction } from '../../i18n';
import type { HolidaySyncRun } from '../../types';

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 underline hover:text-brand-800">
      {children}
    </a>
  );
}

function Section({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-gray-800">
        {title}{' '}
        <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-gray-200">
          {badge}
        </span>
      </p>
      <div className="mt-1 space-y-1 text-gray-700">{children}</div>
    </div>
  );
}

interface HolidaySourcesNoteProps {
  t: TFunction;
  year: number;
  /** Última importação do BOE para o ano em vista (null = ainda não houve). */
  boeImport: HolidaySyncRun | null | undefined;
}

// Nota do topo da página Feriados: de onde vem cada tipo de feriado, onde confirmar, e
// como rever as fiestas locales — que são a única parte que depende de alguém todos os
// anos. Em <details> aberto por omissão: quem já a conhece fecha-a com um clique.
export function HolidaySourcesNote({ t, year, boeImport }: HolidaySourcesNoteProps) {
  return (
    <details open className="mb-4 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-blue-900">{t('holidays.note.title', { year })}</summary>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <Section title={t('holidays.note.national.title')} badge={t('holidays.note.auto')}>
          <p>{t('holidays.note.national.body')}</p>
          <p>
            {t('holidays.note.confirm')} <ExternalLink href={nagerUrl('PT', year)}>Nager.Date PT {year}</ExternalLink>
            {' · '}
            <ExternalLink href={nagerUrl('ES', year)}>Nager.Date ES {year}</ExternalLink>
            {' · '}
            <ExternalLink href={PT_HOLIDAYS_URL}>{t('holidays.note.national.ptLaw')}</ExternalLink>
          </p>
        </Section>

        <Section title={t('holidays.note.regional.title')} badge={t('holidays.note.auto')}>
          <p>{t('holidays.note.regional.body')}</p>
          <p>
            {boeImport?.boe_id
              ? t('holidays.note.regional.imported', {
                  year,
                  boeId: boeImport.boe_id,
                  date: toDisplayDate(boeImport.ran_at.slice(0, 10)),
                })
              : t('holidays.note.regional.pending', { year })}
          </p>
          <p>
            {t('holidays.note.confirm')}{' '}
            {boeImport?.boe_id ? (
              <ExternalLink href={boeResolutionUrl(boeImport.boe_id)}>
                {t('holidays.note.regional.resolution', { boeId: boeImport.boe_id })}
              </ExternalLink>
            ) : (
              <ExternalLink href={BOE_SEARCH_URL}>{t('holidays.note.regional.search', { year })}</ExternalLink>
            )}
          </p>
        </Section>

        <Section title={t('holidays.note.localPT.title')} badge={t('holidays.note.rules')}>
          <p>{t('holidays.note.localPT.body')}</p>
          <p>
            {t('holidays.note.confirm')}{' '}
            <ExternalLink href={PT_MUNICIPAL_HOLIDAYS_URL}>{t('holidays.note.localPT.link')}</ExternalLink>
          </p>
        </Section>

        <Section title={t('holidays.note.localES.title')} badge={t('holidays.note.manual')}>
          <p>{t('holidays.note.localES.body')}</p>
          <ol className="list-decimal space-y-0.5 pl-5">
            <li>{t('holidays.note.localES.step1')}</li>
            <li>{t('holidays.note.localES.step2', { year })}</li>
            <li>
              {t('holidays.note.localES.step3')}{' '}
              <ExternalLink href={CATALONIA_CALENDAR_URL}>{t('holidays.note.localES.catalonia')}</ExternalLink>
            </li>
            <li>{t('holidays.note.localES.step4', { year })}</li>
            <li>{t('holidays.note.localES.step5')}</li>
            <li>{t('holidays.note.localES.step6')}</li>
          </ol>
        </Section>
      </div>
    </details>
  );
}
