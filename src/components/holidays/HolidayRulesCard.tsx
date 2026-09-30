import { useTableSort } from '../../hooks';
import type { SortAccessors } from '../../hooks';
import { Button, Card, EmptyState, SortableTh } from '../ui';
import type { TFunction } from '../../i18n';
import { describeRule } from '../../lib/holidayRuleForm';
import type { HolidayRule } from '../../types';

type RuleSortKey = 'locality' | 'name' | 'recurrence';

/** Chave de ordenação da coluna "Recorrência": as regras de data fixa ordenam-se entre
 *  si por mês/dia e as móveis por distância à Páscoa, com os dois grupos separados —
 *  ordenar pelo texto ("Páscoa +60 dias" vs "Todos os anos: 13/06") misturava as duas
 *  famílias sem dizer nada sobre quando cada feriado cai. */
function ruleSortValue(rule: HolidayRule): string {
  if (rule.rule_type === 'fixed_date') {
    return `0-${String(rule.fixed_month).padStart(2, '0')}-${String(rule.fixed_day).padStart(2, '0')}`;
  }
  // Deslocamento com sinal e largura fixa, para -7 vir antes de +1 e +60 depois de +7.
  return `1-${String((rule.easter_offset_days ?? 0) + 1000).padStart(5, '0')}`;
}

const RULE_SORT: SortAccessors<HolidayRule, RuleSortKey> = {
  locality: (rule) => rule.locality,
  name: (rule) => rule.name,
  recurrence: ruleSortValue,
};

interface HolidayRulesCardProps {
  t: TFunction;
  title: string;
  subtitle: string;
  localityLabel: string;
  emptyLabel: string;
  rules: HolidayRule[];
  /** Localidades com equipamento mas sem nenhuma regra — mostradas como aviso, porque
   *  uma localidade sem feriados locais não aparece em mais lado nenhum da página. */
  missingLocalities: string[];
  /** Aviso informativo acima da tabela (ex: "BOE de 2027 importado — rever as locais"). */
  notice?: string | null;
  /** Página externa onde confirmar a data de cada regra (link "Confirmar" na linha). */
  confirmUrl?: (rule: HolidayRule) => string;
  canManage: boolean;
  onAdd: () => void;
  onEdit: (rule: HolidayRule) => void;
  onDelete: (rule: HolidayRule) => void;
}

// Tabela de regras recorrentes de um país. O botão de adicionar fica no cartão, e não no
// topo da página, porque uma regra recorrente é outra coisa que não um feriado manual —
// separar evita adicionar-se uma julgando estar a adicionar a outra.
export function HolidayRulesCard({
  t,
  title,
  subtitle,
  localityLabel,
  emptyLabel,
  rules,
  missingLocalities,
  notice,
  confirmUrl,
  canManage,
  onAdd,
  onEdit,
  onDelete,
}: HolidayRulesCardProps) {
  const { rows, sortableProps } = useTableSort(rules, RULE_SORT, 'locality');

  return (
    <Card
      padded={false}
      title={title}
      subtitle={subtitle}
      actions={
        canManage && (
          <Button variant="secondary" onClick={onAdd}>
            {t('holidays.rules.add')}
          </Button>
        )
      }
    >
      {notice && <p className="mx-4 my-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">{notice}</p>}
      {missingLocalities.length > 0 && (
        <p className="mx-4 my-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('holidays.rules.missing', { list: missingLocalities.join(', ') })}
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState size="compact">{emptyLabel}</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="pm-table">
            <thead>
              <tr>
                <SortableTh {...sortableProps('locality')}>{localityLabel}</SortableTh>
                <SortableTh {...sortableProps('name')}>{t('common.name')}</SortableTh>
                <SortableTh {...sortableProps('recurrence')}>{t('holidays.rules.recurrence')}</SortableTh>
                <th className="py-1.5 pr-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((rule) => (
                <tr key={rule.id}>
                  <td className="py-1.5 pr-2">{rule.locality}</td>
                  <td className="py-1.5 pr-2 font-medium text-gray-800">{rule.name}</td>
                  <td className="py-1.5 pr-2 text-xs text-gray-400">
                    {describeRule(rule, t)}
                    {rule.valid_from !== null && ` · ${t('holidays.rules.validFrom', { year: rule.valid_from })}`}
                    {rule.valid_to !== null && ` · ${t('holidays.rules.validUntil', { year: rule.valid_to })}`}
                  </td>
                  <td className="py-1.5 pr-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {confirmUrl && (
                        <a
                          href={confirmUrl(rule)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 text-xs font-medium text-brand-700 underline hover:text-brand-800"
                        >
                          {t('holidays.rules.confirm')}
                        </a>
                      )}
                      {canManage && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => onEdit(rule)}>
                            {t('common.edit')}
                          </Button>
                          <Button variant="dangerGhost" size="sm" onClick={() => onDelete(rule)}>
                            {t('common.delete')}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
