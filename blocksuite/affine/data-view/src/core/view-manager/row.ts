import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { computed, type ReadonlySignal } from '@preact/signals-core';

import { type Cell, CellBase } from './cell.js';
import type { SingleView } from './single-view.js';

export interface Row {
  readonly cells$: ReadonlySignal<Cell[]>;
  readonly rowId: string;

  index$: ReadonlySignal<number | undefined>;

  prev$: ReadonlySignal<Row | undefined>;
  next$: ReadonlySignal<Row | undefined>;

  delete(): void;

  move(position: InsertToPosition): void;
}

export class RowBase implements Row {
  cells$ = computed(() => {
    return this.singleView.propertiesRaw$.value.map(property => {
      return new CellBase(this.singleView, property.id, this.rowId);
    });
  });

  index$ = computed(() => {
    const idx = this.singleView.rowIds$.value.indexOf(this.rowId);
    return idx >= 0 ? idx : undefined;
  });

  prev$ = computed(() => {
    const index = this.index$.value;
    if (index == null) {
      return;
    }
    return this.singleView.rows$.value[index - 1];
  });

  next$ = computed(() => {
    const index = this.index$.value;
    if (index == null) {
      return;
    }
    return this.singleView.rows$.value[index + 1];
  });

  constructor(
    readonly singleView: SingleView,
    readonly rowId: string
  ) {}

  get dataSource() {
    return this.singleView.manager.dataSource;
  }

  delete(): void {
    this.dataSource.rowDelete([this.rowId]);
  }

  move(position: InsertToPosition): void {
    this.dataSource.rowMove(this.rowId, position);
  }
}
