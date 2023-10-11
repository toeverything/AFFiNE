import { DEFAULT_SORT_KEY } from '@affine/env/constant';
import type { PageMeta } from '@blocksuite/store';
import { atom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { isEqual } from 'lodash-es';

import { pagesToPageGroups } from './page-group';
import type { PageListProps, PageMetaRecord } from './types';

// for ease of use in the component tree
// note: must use selectAtom to access this atom for efficiency
// @ts-expect-error the error is expected but we will assume the default value is always there by using useHydrateAtoms
export const pageListPropsAtom = atom<PageListProps>();

// whether or not the table is in selection mode (showing selection checkbox & selection floating bar)
const selectionActiveAtom = atom(false);

export const selectionStateAtom = atom(
  get => {
    const baseAtom = selectAtom(
      pageListPropsAtom,
      props => {
        const { selectable, selectedPageIds, onSelectedPageIdsChange } = props;
        return {
          selectable,
          selectedPageIds,
          onSelectedPageIdsChange,
        };
      },
      isEqual
    );
    const baseState = get(baseAtom);
    const selectionActive = get(selectionActiveAtom);
    return {
      ...baseState,
      selectionActive,
    };
  },
  (_get, set, active: boolean) => {
    set(selectionActiveAtom, active);
  }
);

// get handlers from pageListPropsAtom
export const pageListHandlersAtom = selectAtom(
  pageListPropsAtom,
  props => {
    const {
      onSelectedPageIdsChange,
      onToggleFavorite,
      onOpenPage,
      onDragStart,
      onDragEnd,
    } = props;

    return {
      onSelectedPageIdsChange,
      onToggleFavorite,
      onOpenPage,
      onDragStart,
      onDragEnd,
    };
  },
  isEqual
);

export const pagesAtom = selectAtom(pageListPropsAtom, props => props.pages);

type SorterConfig<
  T extends Record<string | number | symbol, unknown> = Record<
    string | number | symbol,
    unknown
  >,
> = {
  key?: keyof T;
  order: 'asc' | 'desc';
  sortingFn: (
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

const sorterStateAtom = atom<SorterConfig>({
  key: DEFAULT_SORT_KEY,
  order: 'desc',
  sortingFn: defaultSortingFn,
});

export const sorterAtom = atom(
  get => {
    let pages = get(pagesAtom);
    const sorterState = get(sorterStateAtom);
    const sortCtx = sorterState.key
      ? {
          key: sorterState.key,
          order: sorterState.order,
        }
      : null;
    if (sortCtx) {
      const compareFn = (a: PageMetaRecord, b: PageMetaRecord) =>
        sorterState.sortingFn(sortCtx, a, b);
      pages = [...pages].sort(compareFn);
    }
    return {
      pages,
      ...sortCtx,
    };
  },
  (_get, set, { newSortKey }: { newSortKey: keyof PageMeta }) => {
    set(sorterStateAtom, sorterState => {
      if (sorterState.key === newSortKey) {
        return {
          ...sorterState,
          order: sorterState.order === 'asc' ? 'desc' : 'asc',
        };
      } else {
        return {
          key: newSortKey,
          order: 'desc',
          sortingFn: sorterState.sortingFn,
        };
      }
    });
  }
);

export const pageGroupsAtom = atom(get => {
  const pages = get(pagesAtom);
  let groupBy = get(selectAtom(pageListPropsAtom, props => props.groupBy));
  const sorter = get(sorterAtom);
  groupBy =
    groupBy ||
    (sorter.key === 'createDate' || sorter.key === 'updatedDate'
      ? sorter.key
      : // default sort
      !sorter.key
      ? DEFAULT_SORT_KEY
      : undefined);
  return pagesToPageGroups(pages, groupBy);
});
