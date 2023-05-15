import { useState } from 'react';

type Sorter<T> = {
  data: T[];
  key: keyof T;
  order: 'asc' | 'desc' | 'none';
};

const defaultSortingFn = <T extends Record<keyof any, unknown>>(
  ctx: {
    key: keyof T;
    order: 'asc' | 'desc' | 'none';
  },
  a: T,
  b: T
) => {
  const valA = a[ctx.key];
  const valB = b[ctx.key];
  const revert = ctx.order === 'desc';
  if (typeof valA !== typeof valB) {
    return 0;
  }
  if (typeof valA === 'string') {
    return valA.localeCompare(valB as string) * (revert ? 1 : -1);
  }
  if (typeof valA === 'number') {
    return valA - (valB as number) * (revert ? 1 : -1);
  }
  return 0;
};

export const useSorter = <T extends Record<keyof any, unknown>>({
  data,
  ...defaultSorter
}: Sorter<T> & { order: 'asc' | 'desc' }) => {
  const [sorter, setSorter] = useState<Omit<Sorter<T>, 'data'>>({
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
  const sortingFn = (a: T, b: T) => defaultSortingFn(sortCtx, a, b);
  const sortedData = data.sort(sortingFn);

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
     * @deprecated In most cases, we no necessary use `setSorter` directly.
     */
    updateSorter: (newVal: Partial<Sorter<T>>) =>
      setSorter({ ...sorter, ...newVal }),
    shiftOrder,
    resetSorter: () => setSorter(defaultSorter),
  };
};
