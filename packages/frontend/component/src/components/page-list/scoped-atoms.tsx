import { DEFAULT_SORT_KEY } from '@affine/env/constant';
import type { PageMeta } from '@blocksuite/store';
import { atom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { createIsolation } from 'jotai-scope';

import { pagesToPageGroups } from './page-group';
import type {
  PageListProps,
  PageMetaRecord,
  VirtualizedPageListProps,
} from './types';
import { shallowEqual } from './utils';

// for ease of use in the component tree
// note: must use selectAtom to access this atom for efficiency
// @ts-expect-error the error is expected but we will assume the default value is always there by using useHydrateAtoms
export const pageListPropsAtom = atom<
  PageListProps & Partial<VirtualizedPageListProps>
>();

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
      shallowEqual
    );
    const baseState = get(baseAtom);
    const selectionActive =
      baseState.selectable === 'toggle'
        ? get(selectionActiveAtom)
        : baseState.selectable;
    return {
      ...baseState,
      selectionActive,
    };
  },
  (_get, set, active: boolean) => {
    set(selectionActiveAtom, active);
  }
);

// id -> isCollapsed
// maybe reset on page on unmount?
export const pageGroupCollapseStateAtom = atom<Record<string, boolean>>({});

// get handlers from pageListPropsAtom
export const pageListHandlersAtom = selectAtom(
  pageListPropsAtom,
  props => {
    const { onSelectedPageIdsChange } = props;
    return {
      onSelectedPageIdsChange,
    };
  },
  shallowEqual
);

export const pagesAtom = selectAtom(
  pageListPropsAtom,
  props => props.pages,
  shallowEqual
);

export const showOperationsAtom = selectAtom(
  pageListPropsAtom,
  props => !!props.pageOperationsRenderer
);

type SortingContext<T extends string | number | symbol> = {
  key: T;
  order: 'asc' | 'desc';
  fallbackKey?: T;
};

type SorterConfig<T extends Record<string, unknown> = Record<string, unknown>> =
  {
    key?: keyof T;
    order: 'asc' | 'desc';
    sortingFn: (ctx: SortingContext<keyof T>, a: T, b: T) => number;
  };

const defaultSortingFn: SorterConfig<PageMetaRecord>['sortingFn'] = (
  ctx,
  a,
  b
) => {
  const val = (obj: PageMetaRecord) => {
    let v = obj[ctx.key];
    if (v === undefined && ctx.fallbackKey) {
      v = obj[ctx.fallbackKey];
    }
    return v;
  };
  const valA = val(a);
  const valB = val(b);
  const revert = ctx.order === 'desc';
  const revertSymbol = revert ? -1 : 1;
  if (typeof valA === 'string' && typeof valB === 'string') {
    return valA.localeCompare(valB) * revertSymbol;
  }
  if (typeof valA === 'number' && typeof valB === 'number') {
    return (valA - valB) * revertSymbol;
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

const sorterStateAtom = atom<SorterConfig<PageMetaRecord>>({
  key: DEFAULT_SORT_KEY,
  order: 'desc',
  sortingFn: defaultSortingFn,
});

export const sorterAtom = atom(
  get => {
    let pages = get(pagesAtom);
    const sorterState = get(sorterStateAtom);
    const sortCtx: SortingContext<keyof PageMetaRecord> | null = sorterState.key
      ? {
          key: sorterState.key,
          order: sorterState.order,
        }
      : null;
    if (sortCtx) {
      if (sorterState.key === 'updatedDate') {
        sortCtx.fallbackKey = 'createDate';
      }
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
  let groupBy = get(selectAtom(pageListPropsAtom, props => props.groupBy));
  const sorter = get(sorterAtom);

  if (groupBy === false) {
    groupBy = undefined;
  } else if (groupBy === undefined) {
    groupBy =
      sorter.key === 'createDate' || sorter.key === 'updatedDate'
        ? sorter.key
        : // default sort
        !sorter.key
        ? DEFAULT_SORT_KEY
        : undefined;
  }
  return pagesToPageGroups(sorter.pages, groupBy);
});

export const {
  Provider: PageListProvider,
  useAtom,
  useAtomValue,
  useSetAtom,
} = createIsolation();
