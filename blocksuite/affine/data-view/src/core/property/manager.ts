import type { UniComponent } from '@blocksuite/affine-shared/types';
import type { ReadonlySignal } from '@preact/signals-core';

import type { Cell } from '../view-manager/cell.js';

export interface CellRenderProps<
  Data extends NonNullable<unknown> = NonNullable<unknown>,
  RawValue = unknown,
  JsonValue = unknown,
> {
  cell: Cell<RawValue, JsonValue, Data>;
  isEditing$: ReadonlySignal<boolean>;
  selectCurrentCell: (editing: boolean) => void;
}

export interface DataViewCellLifeCycle {
  beforeEnterEditMode(): boolean;
  beforeExitEditingMode(): void;

  afterEnterEditingMode(): void;

  focusCell(): boolean;

  blurCell(): boolean;

  forceUpdate(): void;
}

export type DataViewCellComponent<
  Data extends NonNullable<unknown> = NonNullable<unknown>,
  RawValue = unknown,
  JsonValue = unknown,
> = UniComponent<
  CellRenderProps<Data, RawValue, JsonValue>,
  DataViewCellLifeCycle
>;

export type CellRenderer<
  Data extends NonNullable<unknown> = NonNullable<unknown>,
  RawValue = unknown,
  JsonValue = unknown,
> = {
  view: DataViewCellComponent<Data, RawValue, JsonValue>;
};
