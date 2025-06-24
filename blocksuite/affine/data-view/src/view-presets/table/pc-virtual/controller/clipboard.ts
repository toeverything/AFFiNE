import { DisposableGroup } from '@blocksuite/global/disposable';
import type { UIEventStateContext } from '@blocksuite/std';
import type { ReactiveController } from 'lit';

import type { Cell } from '../../../../core/view-manager/cell.js';
import type { Row } from '../../../../core/view-manager/row.js';
import {
  TableViewAreaSelection,
  TableViewRowSelection,
  type TableViewSelection,
  type TableViewSelectionWithType,
} from '../../selection';
import type { VirtualTableViewUILogic } from '../table-view-ui-logic.js';
const BLOCKSUITE_DATABASE_TABLE = 'blocksuite/database/table';
type JsonAreaData = string[][];
const TEXT = 'text/plain';

export class TableClipboardController implements ReactiveController {
  disposables = new DisposableGroup();
  private readonly _onCopy = (
    tableSelection: TableViewSelectionWithType,
    isCut = false
  ) => {
    const area = getSelectedArea(tableSelection, this.logic);
    if (!area) {
      return;
    }
    const stringResult = area
      .map(row => row.cells.map(cell => cell.stringValue$.value).join('\t'))
      .join('\n');
    const jsonResult: JsonAreaData = area.map(row =>
      row.cells.map(cell => cell.stringValue$.value ?? '')
    );
    if (isCut) {
      const deleteRows: string[] = [];
      for (const row of area) {
        if (row.row) {
          deleteRows.push(row.row.rowId);
        } else {
          for (const cell of row.cells) {
            cell.valueSet(undefined);
          }
        }
      }
      if (deleteRows.length) {
        this.logic.view.rowsDelete(deleteRows);
        this.logic.ui$.value?.requestUpdate();
      }
    }
    this.clipboard
      .writeToClipboard(items => {
        return {
          ...items,
          [TEXT]: stringResult,
          [BLOCKSUITE_DATABASE_TABLE]: JSON.stringify(jsonResult),
        };
      })
      .then(() => {
        if (area[0]?.row) {
          this.notification.toast(
            `${area.length} row${area.length > 1 ? 's' : ''} copied to clipboard`
          );
        } else {
          const count = area.flatMap(row => row.cells).length;
          this.notification.toast(
            `${count} cell${count > 1 ? 's' : ''} copied to clipboard`
          );
        }
      })
      .catch(console.error);

    return true;
  };

  private readonly _onCut = (tableSelection: TableViewSelectionWithType) => {
    this._onCopy(tableSelection, true);
  };

  private readonly _onPaste = async (_context: UIEventStateContext) => {
    const event = _context.get('clipboardState').raw;
    event.stopPropagation();

    const active = document.activeElement as HTMLElement | null;
    if (
      active &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
    ) {
      return true;
    }

    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const tableSelection = this.selection;
    if (TableViewRowSelection.is(tableSelection)) {
      return;
    }
    if (tableSelection) {
      try {
        // First try to read internal format data
        const json = await this.clipboard.readFromClipboard(clipboardData);
        const dataString = json[BLOCKSUITE_DATABASE_TABLE];

        if (dataString) {
          // If internal format data exists, use it
          const jsonAreaData = JSON.parse(dataString) as JsonAreaData;
          pasteToCells(this.logic, jsonAreaData, tableSelection);
          return true;
        }
      } catch {
        // Ignore error when reading internal format, will fallback to plain text
        console.debug('No internal format data found, trying plain text');
      }

      // Try reading plain text (possibly copied from Excel)
      const plainText = clipboardData.getData('text/plain');
      if (plainText) {
        // Split text by newlines and then by tabs for each line
        const rows = plainText
          .split(/\r?\n/)
          .map(line => line.split('\t').map(cell => cell.trim()))
          .filter(row => row.some(cell => cell !== '')); // Filter out empty rows

        if (rows.length > 0) {
          pasteToCells(this.logic, rows, tableSelection);
        }
      }
    }

    return true;
  };

  private get clipboard() {
    return this.logic.root.config.clipboard;
  }

  private get notification() {
    return this.logic.root.config.notification;
  }

  private get readonly() {
    return this.logic.view.readonly$.value;
  }

  constructor(public logic: VirtualTableViewUILogic) {}

  get host() {
    return this.logic.ui$.value;
  }
  get selection() {
    return this.logic.selectionController.selection;
  }

  copy() {
    const tableSelection = this.selection;
    if (!tableSelection) {
      return;
    }
    this._onCopy(tableSelection);
  }

  cut() {
    const tableSelection = this.selection;
    if (!tableSelection) {
      return;
    }
    this._onCopy(tableSelection, true);
  }

  hostConnected() {
    this.disposables.add(
      this.logic.handleEvent('copy', _ctx => {
        const tableSelection = this.selection;
        if (!tableSelection) return false;

        this._onCopy(tableSelection);
        return true;
      })
    );

    this.disposables.add(
      this.logic.handleEvent('cut', _ctx => {
        const tableSelection = this.selection;
        if (!tableSelection) return false;

        this._onCut(tableSelection);
        return true;
      })
    );

    this.disposables.add(
      this.logic.handleEvent('paste', ctx => {
        if (this.readonly) return false;

        this._onPaste(ctx).catch(console.error);
        return true;
      })
    );
  }
}

function getSelectedArea(
  selection: TableViewSelection,
  table: VirtualTableViewUILogic
): SelectedArea | undefined {
  const view = table.view;
  if (TableViewRowSelection.is(selection)) {
    const rows = TableViewRowSelection.rows(selection)
      .map(row => {
        const y =
          table.selectionController.getRow(row.groupKey, row.id)?.top$?.value ??
          0;
        return {
          y,
          row,
        };
      })
      .sort((a, b) => a.y - b.y)
      .map(v => v.row);
    return rows.map(r => {
      const row = view.rowGetOrCreate(r.id);
      return {
        row,
        cells: row.cells$.value,
      };
    });
  }
  const { rowsSelection, columnsSelection, groupKey } = selection;
  const data: SelectedArea = [];
  const rows = groupKey
    ? view.groupTrait.groupDataMap$.value?.[groupKey]?.rows
    : view.rows$.value;
  const columns = view.propertyIds$.value;
  if (!rows) {
    return;
  }
  for (let i = rowsSelection.start; i <= rowsSelection.end; i++) {
    const rowArea: SelectedArea[number] = {
      cells: [],
    };
    const row = rows[i];
    if (row == null) {
      continue;
    }
    for (let j = columnsSelection.start; j <= columnsSelection.end; j++) {
      const columnId = columns[j];
      if (columnId == null) {
        continue;
      }
      const cell = view.cellGetOrCreate(row.rowId, columnId);
      rowArea.cells.push(cell);
    }
    data.push(rowArea);
  }

  return data;
}

type SelectedArea = {
  row?: Row;
  cells: Cell[];
}[];

function getTargetRangeFromSelection(
  selection: TableViewAreaSelection,
  data: JsonAreaData
) {
  const { rowsSelection, columnsSelection, focus } = selection;
  return TableViewAreaSelection.isFocus(selection)
    ? {
        row: {
          start: focus.rowIndex,
          length: data.length,
        },
        column: {
          start: focus.columnIndex,
          length: data[0]?.length ?? 0,
        },
      }
    : {
        row: {
          start: rowsSelection.start,
          length: rowsSelection.end - rowsSelection.start + 1,
        },
        column: {
          start: columnsSelection.start,
          length: columnsSelection.end - columnsSelection.start + 1,
        },
      };
}

function pasteToCells(
  table: VirtualTableViewUILogic,
  rows: JsonAreaData,
  selection: TableViewAreaSelection
) {
  const srcRowLength = rows.length;
  const srcColumnLength = rows[0]?.length ?? 0;
  const targetRange = getTargetRangeFromSelection(selection, rows);
  for (let i = 0; i < targetRange.row.length; i++) {
    for (let j = 0; j < targetRange.column.length; j++) {
      const rowIndex = targetRange.row.start + i;
      const columnIndex = targetRange.column.start + j;

      const srcRowIndex = i % srcRowLength;
      const srcColumnIndex = j % srcColumnLength;
      const dataString = rows[srcRowIndex]?.[srcColumnIndex];

      const targetContainer = table.selectionController.getCellContainer(
        selection.groupKey,
        rowIndex,
        columnIndex
      );
      const rowId = targetContainer?.rowId;
      const columnId = targetContainer?.columnId;
      if (rowId && columnId) {
        targetContainer?.column$.value?.valueSetFromString(
          rowId,
          dataString ?? ''
        );
      }
    }
  }
}
