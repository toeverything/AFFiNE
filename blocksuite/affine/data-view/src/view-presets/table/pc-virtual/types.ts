import type { Signal } from '@blocksuite/affine-shared/utils';
import type { ReadonlySignal } from '@preact/signals-core';

import type {
  GridCell,
  GridGroup,
  GridRow,
  GridVirtualScroll,
} from './virtual/virtual-scroll';

export type TableGroupData = {
  hover$: ReadonlySignal<boolean>;
  headerHover$: Signal<boolean>;
  footerHover$: Signal<boolean>;
};

export type TableRowData = {
  hover$: ReadonlySignal<boolean>;
  selected$: ReadonlySignal<boolean>;
};

export type TableCellData = {
  hover$: Signal<boolean>;
};

export type TableGrid = GridVirtualScroll<
  TableGroupData,
  TableRowData,
  TableCellData
>;
export type TableGridGroup = GridGroup<
  TableGroupData,
  TableRowData,
  TableCellData
>;
export type TableGridRow = GridRow<TableGroupData, TableRowData, TableCellData>;
export type TableGridCell = GridCell<
  TableGroupData,
  TableRowData,
  TableCellData
>;
