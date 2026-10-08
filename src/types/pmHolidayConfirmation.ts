/** Porque é que uma PM fica de propósito num dia de feriado (migração 0029). */
export type PmHolidayConfirmationReason = 'client_request' | 'other_engineer' | 'other';

/** PM confirmada num dia de feriado do hospital — tira-a da revisão "PMs marcadas em
 *  feriados". Uma linha por (PM, dia de feriado). */
export type PmHolidayConfirmation = {
  id: string;
  pm_event_id: string;
  /** 'yyyy-MM-dd'. */
  holiday_date: string;
  reason: PmHolidayConfirmationReason;
  notes: string | null;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string;
};

export type PmHolidayConfirmationInsert = Pick<
  PmHolidayConfirmation,
  'pm_event_id' | 'holiday_date' | 'reason' | 'notes' | 'confirmed_by_name'
>;
