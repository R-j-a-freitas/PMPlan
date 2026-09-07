import { useCallback, useMemo, useState } from 'react';

/** Valor por que uma coluna é ordenada — o que a célula mostra, não o que está na BD:
 *  ordenar a coluna "Localidade" tem de seguir "Galiza" e não "ES-GA". Números e
 *  booleanos ordenam como tal (2 antes de 10, "Não" antes de "Sim"); tudo o resto vai
 *  a texto. */
export type SortValue = string | number | boolean | null | undefined;

export type SortDirection = 'asc' | 'desc';

/** Um extractor por coluna ordenável, indexado pelo identificador da coluna. Definir o
 *  mapa fora do componente (ou em useMemo, quando precisa de dados de fora da linha)
 *  evita reordenar a lista a cada render. */
export type SortAccessors<T, K extends string> = Record<K, (row: T) => SortValue>;

/** O que a SortableTh precisa de saber sobre a sua coluna — devolvido por sortableProps. */
export interface SortableHeaderProps {
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
}

// Ordenação com as regras do português: "Ávila" ao pé de "Avila" e não no fim do
// alfabeto, e numeração natural — "Sala 2" antes de "Sala 10", que é a diferença entre
// uma lista de equipamentos legível e uma que obriga a procurar.
const COLLATOR = new Intl.Collator('pt', { numeric: true, sensitivity: 'base' });

function isEmpty(value: SortValue): boolean {
  return value === null || value === undefined || value === '';
}

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return COLLATOR.compare(String(a), String(b));
}

/** Ordenação de tabela por qualquer coluna, nos dois sentidos. Recebe as linhas já
 *  filtradas (a procura continua a ser de quem usa) e devolve-as ordenadas, mais o
 *  estado a passar aos cabeçalhos.
 *
 *  Células vazias ficam sempre no fim, em qualquer dos sentidos: quem ordena por uma
 *  coluna quer ver o que ela tem, e uma fila de traços no topo era o contrário disso. */
export function useTableSort<T, K extends string>(
  rows: T[],
  accessors: SortAccessors<T, K>,
  // NoInfer: as colunas ordenáveis são as chaves de `accessors` e mais nenhumas — sem
  // isto, passar a coluna inicial estreitava K a esse único literal e todas as outras
  // colunas passavam a erro de tipo.
  initialKey: NoInfer<K> | null = null,
  initialDirection: SortDirection = 'asc',
) {
  const [sortKey, setSortKey] = useState<K | null>(initialKey);
  const [direction, setDirection] = useState<SortDirection>(initialDirection);

  const sortedRows = useMemo(() => {
    const accessor = sortKey ? accessors[sortKey] : null;
    if (!accessor) return rows;
    // Array.prototype.sort é estável (ES2019): quem empata mantém a ordem em que já
    // estava. Por isso o sentido descendente inverte o comparador em vez de inverter o
    // array — inverter o array baralhava também os empates a cada clique.
    return [...rows].sort((a, b) => {
      const left = accessor(a);
      const right = accessor(b);
      const emptyDiff = Number(isEmpty(left)) - Number(isEmpty(right));
      if (emptyDiff !== 0) return emptyDiff;
      const diff = compareValues(left, right);
      return direction === 'asc' ? diff : -diff;
    });
  }, [rows, accessors, sortKey, direction]);

  // Clicar na coluna activa troca o sentido; clicar noutra passa a ordenar por ela,
  // sempre a começar em ascendente (é o sentido que se espera de um primeiro clique).
  const toggleSort = useCallback(
    (key: K) => {
      if (key === sortKey) {
        setDirection(direction === 'asc' ? 'desc' : 'asc');
      } else {
        setSortKey(key);
        setDirection('asc');
      }
    },
    [sortKey, direction],
  );

  const sortableProps = useCallback(
    (key: K): SortableHeaderProps => ({
      active: sortKey === key,
      // Um cabeçalho inactivo anuncia o que o primeiro clique vai fazer (ascendente).
      direction: sortKey === key ? direction : 'asc',
      onSort: () => toggleSort(key),
    }),
    [sortKey, direction, toggleSort],
  );

  return { rows: sortedRows, sortKey, direction, toggleSort, sortableProps };
}
