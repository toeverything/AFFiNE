import type { ReadonlySignal } from '@preact/signals-core';

import { multiSelectPropertyType } from '../../property-presets/multi-select/define.js';
import { selectPropertyType } from '../../property-presets/select/define.js';
import type { TableViewSelectionWithType } from './selection';
import { TableViewRowSelection } from './selection';

export interface TableCell {
  rowId: string;
  setTagDraft?(value: string): void;
}

const TAG_COLUMN_TYPES = new Set<string>([
  selectPropertyType.type,
  multiSelectPropertyType.type,
]);

export type ColumnAccessor<T extends TableCell> = (cell: T) =>
  | {
      valueSetFromString(rowId: string, value: string): void;
      type$: ReadonlySignal<string>;
    }
  | undefined;

export interface StartEditOptions<T extends TableCell> {
  event: KeyboardEvent;
  selection: TableViewSelectionWithType | undefined;
  getCellContainer: (
    groupKey: string | undefined,
    rowIndex: number,
    columnIndex: number
  ) => T | undefined;
  updateSelection: (sel: TableViewSelectionWithType) => void;
  getColumn: ColumnAccessor<T>;
}

export function handleCharStartEdit<T extends TableCell>(
  options: StartEditOptions<T>
): boolean {
  const { event, selection, getCellContainer, updateSelection, getColumn } =
    options;

  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    return false;
  }

  if (
    selection &&
    !TableViewRowSelection.is(selection) &&
    !selection.isEditing &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.length === 1
  ) {
    const cell = getCellContainer(
      selection.groupKey,
      selection.focus.rowIndex,
      selection.focus.columnIndex
    );
    if (cell) {
      const column = getColumn(cell);
      if (column) {
        if (TAG_COLUMN_TYPES.has(column.type$.value) && cell.setTagDraft) {
          cell.setTagDraft(event.key);
        } else {
          column.valueSetFromString(cell.rowId, event.key);
        }
      }
      updateSelection({ ...selection, isEditing: true });
      event.preventDefault();
      return true;
    }
  }
  return false;
}
