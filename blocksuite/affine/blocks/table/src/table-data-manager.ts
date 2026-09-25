import type {
  CellTextAlign,
  CellVerticalAlign,
  TableBlockModel,
  TableCell,
} from '@blocksuite/affine-model';
import { generateFractionalIndexingKeyBetween } from '@blocksuite/affine-shared/utils';
import { nanoid, Text } from '@blocksuite/store';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';

import type { TableAreaSelection } from './selection-schema';
import { compareByOrder } from './utils';

export class TableDataManager {
  constructor(private readonly model: TableBlockModel) {}
  readonly readonly$: ReadonlySignal<boolean> = computed(() => {
    return this.model.store.readonly;
  });
  readonly ui = {
    columnIndicatorIndex$: signal<number>(),
    rowIndicatorIndex$: signal<number>(),
  };
  readonly hoverColumnIndex$ = signal<number>();
  readonly hoverRowIndex$ = signal<number>();
  readonly hoverDragHandleColumnId$ = signal<string>();
  readonly widthAdjustColumnId$ = signal<string>();
  readonly virtualColumnCount$ = signal<number>(0);
  readonly virtualRowCount$ = signal<number>(0);
  readonly virtualWidth$ = signal<
    { columnId: string; width: number } | undefined
  >();
  readonly cellCountTips$ = computed(
    () =>
      `${this.virtualRowCount$.value + this.rows$.value.length} x ${this.virtualColumnCount$.value + this.columns$.value.length}`
  );
  readonly rows$ = computed(() => {
    return Object.values(this.model.props.rows$.value).sort(compareByOrder);
  });

  readonly columns$ = computed(() => {
    return Object.values(this.model.props.columns$.value).sort(compareByOrder);
  });

  readonly uiRows$ = computed(() => {
    const virtualRowCount = this.virtualRowCount$.value;
    const rows = this.rows$.value;
    if (virtualRowCount === 0) {
      return rows;
    }
    if (virtualRowCount > 0) {
      return [
        ...rows,
        ...Array.from({ length: virtualRowCount }, (_, i) => ({
          rowId: `${i}`,
          backgroundColor: undefined,
        })),
      ];
    }
    return rows.slice(0, rows.length + virtualRowCount);
  });

  readonly uiColumns$ = computed(() => {
    const virtualColumnCount = this.virtualColumnCount$.value;
    const columns = this.columns$.value;
    if (virtualColumnCount === 0) {
      return columns;
    }
    if (virtualColumnCount > 0) {
      return [
        ...columns,
        ...Array.from({ length: virtualColumnCount }, (_, i) => ({
          columnId: `${i}`,
          backgroundColor: undefined,
          width: undefined,
        })),
      ];
    }
    return columns.slice(0, columns.length + virtualColumnCount);
  });

  getCell(rowId: string, columnId: string): TableCell | undefined {
    return this.model.props.cells$.value[`${rowId}:${columnId}`];
  }

  addRow(after?: number) {
    const order = this.getOrder(this.rows$.value, after);
    const rowId = nanoid();
    this.model.store.transact(() => {
      this.model.props.rows[rowId] = {
        rowId,
        order,
      };

      this.columns$.value.forEach(column => {
        this.model.props.cells[`${rowId}:${column.columnId}`] = {
          text: new Text(),
        };
      });
    });
    return rowId;
  }
  addNRow(count: number) {
    if (count === 0) {
      return;
    }
    if (count > 0) {
      this.model.store.transact(() => {
        for (let i = 0; i < count; i++) {
          this.addRow(this.rows$.value.length - 1);
        }
      });
    } else {
      const rows = this.rows$.value;
      const rowCount = rows.length;
      this.model.store.transact(() => {
        rows.slice(rowCount + count, rowCount).forEach(row => {
          this.deleteRow(row.rowId);
        });
      });
    }
  }

  addNColumn(count: number) {
    if (count === 0) {
      return;
    }
    if (count > 0) {
      this.model.store.transact(() => {
        for (let i = 0; i < count; i++) {
          this.addColumn(this.columns$.value.length - 1);
        }
      });
    } else {
      const columns = this.columns$.value;
      const columnCount = columns.length;
      this.model.store.transact(() => {
        columns.slice(columnCount + count, columnCount).forEach(column => {
          this.deleteColumn(column.columnId);
        });
      });
    }
  }

  private getOrder<T extends { order: string }>(array: T[], after?: number) {
    after = after != null ? (after < 0 ? undefined : after) : undefined;
    const prevOrder = after == null ? null : array[after]?.order;
    const nextOrder = after == null ? array[0]?.order : array[after + 1]?.order;
    const order = generateFractionalIndexingKeyBetween(
      prevOrder ?? null,
      nextOrder ?? null
    );
    return order;
  }

  addColumn(after?: number) {
    const order = this.getOrder(this.columns$.value, after);
    const columnId = nanoid();
    this.model.store.transact(() => {
      this.model.props.columns[columnId] = {
        columnId,
        order,
      };
      this.rows$.value.forEach(row => {
        this.model.props.cells[`${row.rowId}:${columnId}`] = {
          text: new Text(),
        };
      });
    });
    return columnId;
  }

  deleteRow(rowId: string) {
    this.model.store.transact(() => {
      Object.keys(this.model.props.rows).forEach(id => {
        if (id === rowId) {
          delete this.model.props.rows[id];
        }
      });
      Object.keys(this.model.props.cells).forEach(id => {
        if (id.startsWith(rowId)) {
          delete this.model.props.cells[id];
        }
      });
    });
  }

  deleteColumn(columnId: string) {
    this.model.store.transact(() => {
      Object.keys(this.model.props.columns).forEach(id => {
        if (id === columnId) {
          delete this.model.props.columns[id];
        }
      });
      Object.keys(this.model.props.cells).forEach(id => {
        if (id.endsWith(`:${columnId}`)) {
          delete this.model.props.cells[id];
        }
      });
    });
  }

  updateRowOrder(rowId: string, newOrder: string) {
    this.model.store.transact(() => {
      if (this.model.props.rows[rowId]) {
        this.model.props.rows[rowId].order = newOrder;
      }
    });
  }

  updateColumnOrder(columnId: string, newOrder: string) {
    this.model.store.transact(() => {
      if (this.model.props.columns[columnId]) {
        this.model.props.columns[columnId].order = newOrder;
      }
    });
  }

  setRowBackgroundColor(rowId: string, color?: string) {
    this.model.store.transact(() => {
      if (this.model.props.rows[rowId]) {
        this.model.props.rows[rowId].backgroundColor = color;
      }
    });
  }

  setColumnBackgroundColor(columnId: string, color?: string) {
    this.model.store.transact(() => {
      if (this.model.props.columns[columnId]) {
        this.model.props.columns[columnId].backgroundColor = color;
      }
    });
  }

  setColumnWidth(columnId: string, width: number) {
    this.model.store.transact(() => {
      if (this.model.props.columns[columnId]) {
        this.model.props.columns[columnId].width = width;
      }
    });
  }

  clearRow(rowId: string) {
    this.model.store.transact(() => {
      Object.keys(this.model.props.cells).forEach(id => {
        if (id.startsWith(rowId)) {
          this.model.props.cells[id]?.text.replace(
            0,
            this.model.props.cells[id]?.text.length,
            ''
          );
        }
      });
    });
  }

  clearColumn(columnId: string) {
    this.model.store.transact(() => {
      Object.keys(this.model.props.cells).forEach(id => {
        if (id.endsWith(`:${columnId}`)) {
          this.model.props.cells[id]?.text.replace(
            0,
            this.model.props.cells[id]?.text.length,
            ''
          );
        }
      });
    });
  }

  clearCellsBySelection(selection: TableAreaSelection) {
    const columns = this.uiColumns$.value;
    const rows = this.uiRows$.value;
    const deleteCells: { rowId: string; columnId: string }[] = [];
    for (let i = selection.rowStartIndex; i <= selection.rowEndIndex; i++) {
      const row = rows[i];
      if (!row) {
        continue;
      }
      for (
        let j = selection.columnStartIndex;
        j <= selection.columnEndIndex;
        j++
      ) {
        const column = columns[j];
        if (!column) {
          continue;
        }
        deleteCells.push({ rowId: row.rowId, columnId: column.columnId });
      }
    }
    this.clearCells(deleteCells);
  }

  clearCells(cells: { rowId: string; columnId: string }[]) {
    this.model.store.transact(() => {
      cells.forEach(({ rowId, columnId }) => {
        const text = this.model.props.cells[`${rowId}:${columnId}`]?.text;
        if (text) {
          text.replace(0, text.length, '');
        }
      });
    });
  }

  insertColumn(after?: number) {
    this.addColumn(after);
  }

  insertRow(after?: number) {
    this.addRow(after);
  }

  moveColumn(from: number, after?: number) {
    const columns = this.columns$.value;
    const column = columns[from];
    if (!column) return;
    const order = this.getOrder(columns, after);
    this.model.store.transact(() => {
      const realColumn = this.model.props.columns[column.columnId];
      if (realColumn) {
        realColumn.order = order;
      }
    });
  }

  moveRow(from: number, after?: number) {
    const rows = this.rows$.value;
    const row = rows[from];
    if (!row) return;
    const order = this.getOrder(rows, after);
    this.model.store.transact(() => {
      const realRow = this.model.props.rows[row.rowId];
      if (realRow) {
        realRow.order = order;
      }
    });
  }

  duplicateColumn(index: number) {
    const oldColumn = this.columns$.value[index];
    if (!oldColumn) return;
    const order = this.getOrder(this.columns$.value, index);
    const newColumnId = nanoid();
    this.model.store.transact(() => {
      this.model.props.columns[newColumnId] = {
        ...oldColumn,
        columnId: newColumnId,
        order,
      };
      this.rows$.value.forEach(row => {
        this.model.props.cells[`${row.rowId}:${newColumnId}`] = {
          text:
            this.model.props.cells[
              `${row.rowId}:${oldColumn.columnId}`
            ]?.text.clone() ?? new Text(),
        };
      });
    });
    return newColumnId;
  }

  duplicateRow(index: number) {
    const oldRow = this.rows$.value[index];
    if (!oldRow) return;
    const order = this.getOrder(this.rows$.value, index);
    const newRowId = nanoid();
    this.model.store.transact(() => {
      this.model.props.rows[newRowId] = {
        ...oldRow,
        rowId: newRowId,
        order,
      };
      this.columns$.value.forEach(column => {
        this.model.props.cells[`${newRowId}:${column.columnId}`] = {
          text:
            this.model.props.cells[
              `${oldRow.rowId}:${column.columnId}`
            ]?.text.clone() ?? new Text(),
        };
      });
    });
    return newRowId;
  }

  // ── Cell Merging ────────────────────────────────────────────────────────

  /**
   * Merge all cells in the area selection into the top-left cell.
   * The text of all non-empty covered cells is concatenated (newline-separated)
   * into the top-left cell. All other covered cells are marked hidden.
   */
  mergeCells(selection: TableAreaSelection) {
    const rows = this.rows$.value;
    const columns = this.columns$.value;
    const { rowStartIndex, rowEndIndex, columnStartIndex, columnEndIndex } =
      selection;

    if (rowStartIndex === rowEndIndex && columnStartIndex === columnEndIndex) {
      return; // single cell — nothing to merge
    }

    const colSpan = columnEndIndex - columnStartIndex + 1;
    const rowSpan = rowEndIndex - rowStartIndex + 1;

    const topLeftRow = rows[rowStartIndex];
    const topLeftCol = columns[columnStartIndex];
    if (!topLeftRow || !topLeftCol) return;

    const topLeftKey = `${topLeftRow.rowId}:${topLeftCol.columnId}`;

    for (let r = rowStartIndex; r <= rowEndIndex; r++) {
      for (let c = columnStartIndex; c <= columnEndIndex; c++) {
        const row = rows[r];
        const col = columns[c];
        if (!row || !col) continue;
        const current = this.model.props.cells[`${row.rowId}:${col.columnId}`];
        if (!current) continue;
        if (current.hidden) return;
        const cs = current.colSpan ?? 1;
        const rs = current.rowSpan ?? 1;
        if (cs > 1 || rs > 1) {
          const spanRowEnd = r + rs - 1;
          const spanColEnd = c + cs - 1;
          if (spanRowEnd > rowEndIndex || spanColEnd > columnEndIndex) {
            return;
          }
        }
      }
    }

    this.model.store.transact(() => {
      // Collect non-empty text from all covered cells (excluding top-left)
      const extraTexts: string[] = [];
      for (let r = rowStartIndex; r <= rowEndIndex; r++) {
        for (let c = columnStartIndex; c <= columnEndIndex; c++) {
          if (r === rowStartIndex && c === columnStartIndex) continue;
          const row = rows[r];
          const col = columns[c];
          if (!row || !col) continue;
          const key = `${row.rowId}:${col.columnId}`;
          const cell = this.model.props.cells[key];
          if (cell) {
            const t = cell.text.toString();
            if (t.trim()) extraTexts.push(t);
            if (cell.text.length > 0) {
              cell.text.replace(0, cell.text.length, '');
            }
            delete cell.colSpan;
            delete cell.rowSpan;
            cell.hidden = true;
          }
        }
      }

      // Update the top-left cell — mutate in place to keep Y.Text attached
      const topLeft = this.model.props.cells[topLeftKey];
      if (topLeft) {
        delete topLeft.hidden;
        if (extraTexts.length) {
          const topLeftText = topLeft.text.toString();
          const combined =
            topLeftText + (topLeftText ? '\n' : '') + extraTexts.join('\n');
          topLeft.text.replace(0, topLeft.text.length, combined);
        }
        topLeft.colSpan = colSpan;
        topLeft.rowSpan = rowSpan;
      }
    });
  }

  /**
   * Unmerge a previously merged cell back to individual cells.
   */
  unmergeCells(rowId: string, columnId: string) {
    const key = `${rowId}:${columnId}`;
    const cell = this.model.props.cells[key];
    if (!cell || (!cell.colSpan && !cell.rowSpan)) return;

    const rows = this.rows$.value;
    const columns = this.columns$.value;
    const rowIndex = rows.findIndex(r => r.rowId === rowId);
    const colIndex = columns.findIndex(c => c.columnId === columnId);
    if (rowIndex === -1 || colIndex === -1) return;

    const colSpan = cell.colSpan ?? 1;
    const rowSpan = cell.rowSpan ?? 1;

    this.model.store.transact(() => {
      // Reset the top-left cell — mutate in place to keep Y.Text attached
      const topLeft = this.model.props.cells[key];
      if (topLeft) {
        delete topLeft.colSpan;
        delete topLeft.rowSpan;
      }

      // Restore all covered cells — clear hidden flag in place
      for (let r = rowIndex; r < rowIndex + rowSpan; r++) {
        for (let c = colIndex; c < colIndex + colSpan; c++) {
          if (r === rowIndex && c === colIndex) continue;
          const row = rows[r];
          const col = columns[c];
          if (!row || !col) continue;
          const coveredKey = `${row.rowId}:${col.columnId}`;
          const existing = this.model.props.cells[coveredKey];
          if (existing) {
            delete existing.hidden;
          }
        }
      }
    });
  }

  // ── Text / Vertical Alignment ────────────────────────────────────────

  setSelectionTextAlign(selection: TableAreaSelection, align: CellTextAlign) {
    const rows = this.rows$.value;
    const columns = this.columns$.value;
    this.model.store.transact(() => {
      for (let r = selection.rowStartIndex; r <= selection.rowEndIndex; r++) {
        for (
          let c = selection.columnStartIndex;
          c <= selection.columnEndIndex;
          c++
        ) {
          const row = rows[r];
          const col = columns[c];
          if (!row || !col) continue;
          const cell = this.model.props.cells[`${row.rowId}:${col.columnId}`];
          if (cell) {
            cell.textAlign = align;
          }
        }
      }
    });
  }

  setSelectionVerticalAlign(
    selection: TableAreaSelection,
    align: CellVerticalAlign
  ) {
    const rows = this.rows$.value;
    const columns = this.columns$.value;
    this.model.store.transact(() => {
      for (let r = selection.rowStartIndex; r <= selection.rowEndIndex; r++) {
        for (
          let c = selection.columnStartIndex;
          c <= selection.columnEndIndex;
          c++
        ) {
          const row = rows[r];
          const col = columns[c];
          if (!row || !col) continue;
          const cell = this.model.props.cells[`${row.rowId}:${col.columnId}`];
          if (cell) {
            cell.verticalAlign = align;
          }
        }
      }
    });
  }
}
