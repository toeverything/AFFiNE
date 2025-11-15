import { computed, type ReadonlySignal } from '@preact/signals-core';

import { createTraitKey } from '../traits/key.js';
import type { Row, SingleView } from '../view-manager/index.js';
import { evalSort } from './eval.js';
import type { Sort, SortBy } from './types.js';

export class SortManager {
  hasSort$ = computed(() => (this.sort$.value?.sortBy?.length ?? 0) > 0);

  setSortList = (sortList: SortBy[]) => {
    this.ops.setSortList({
      manuallySort: [],
      ...this.sort$.value,
      sortBy: sortList,
    });
  };

  sort = (rows: Row[]) => {
    if (!this.sort$.value) {
      return rows;
    }
    const compare = evalSort(this.sort$.value, this.view);
    if (!compare) {
      return rows;
    }
    const newRows = rows.slice();
    newRows.sort(compare);
    return newRows;
  };

  sortList$ = computed(() => this.sort$.value?.sortBy ?? []);

  constructor(
    readonly sort$: ReadonlySignal<Sort | undefined>,
    readonly view: SingleView,
    private readonly ops: {
      setSortList: (sortList: Sort) => void;
    }
  ) {}
}

export const sortTraitKey = createTraitKey<SortManager>('sort');
