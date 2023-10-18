import { useState } from 'react';

type SorterConfig<
  T extends Record<string | number | symbol, unknown> = Record<
    string | number | symbol,
    unknown
  >,
> = {
  data: T[];
  key: keyof T;
  order: 'asc' | 'desc' | 'none';
  sortingFn?: (
    ctx: {
      key: keyof T;
      order: 'asc' | 'desc';
    },
    a: T,
    b: T
  ) => number;
};

const defaultSortingFn: SorterConfig['sortingFn'] = (ctx, a, b) => {
  const valA = a[ctx.key];
  const valB = b[ctx.key];
  const revert = ctx.order === 'desc';
  const revertSymbol = revert ? -1 : 1;
  if (typeof valA === 'string' && typeof valB === 'string') {
    return valA.localeCompare(valB) * revertSymbol;
  }
  if (typeof valA === 'number' && typeof valB === 'number') {
    return valA - valB * revertSymbol;
  }
  if (valA instanceof Date && valB instanceof Date) {
    return (valA.getTime() - valB.getTime()) * revertSymbol;
  }
  if (!valA) {
    return -1 * revertSymbol;
  }
  if (!valB) {
    return 1 * revertSymbol;
  }

  if (Array.isArray(valA) && Array.isArray(valB)) {
    return (valA.length - valB.length) * revertSymbol;
  }
  console.warn(
    'Unsupported sorting type! Please use custom sorting function.',
    valA,
    valB
  );
  return 0;
};

export const useSorter = <T extends Record<keyof any, unknown>>({
  data,
  sortingFn = defaultSortingFn,
  ...defaultSorter
}: SorterConfig<T> & { order: 'asc' | 'desc' }) => {
  const [sorter, setSorter] = useState<Omit<SorterConfig<T>, 'data'>>({
    ...defaultSorter,
    // We should not show sorting icon at first time
    order: 'none',
  });
  const sortCtx =
    sorter.order === 'none'
      ? {
          key: defaultSorter.key,
          order: defaultSorter.order,
        }
      : {
          key: sorter.key,
          order: sorter.order,
        };
  const compareFn = (a: T, b: T) => sortingFn(sortCtx, a, b);
  const sortedData = data.sort(compareFn);

  const shiftOrder = (key?: keyof T) => {
    const orders = ['asc', 'desc', 'none'] as const;
    if (key && key !== sorter.key) {
      // Key changed
      setSorter({
        ...sorter,
        key,
        order: orders[0],
      });
      return;
    }
    setSorter({
      ...sorter,
      order: orders[(orders.indexOf(sorter.order) + 1) % orders.length],
    });
  };
  return {
    data: sortedData,
    order: sorter.order,
    key: sorter.order !== 'none' ? sorter.key : null,
    /**
     * @deprecated In most cases, we no necessary use `updateSorter` directly.
     */
    updateSorter: (newVal: Partial<SorterConfig<T>>) =>
      setSorter({ ...sorter, ...newVal }),
    shiftOrder,
    resetSorter: () => setSorter(defaultSorter),
  };
};
