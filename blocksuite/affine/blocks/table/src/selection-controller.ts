import {
  domToOffsets,
  getAreaByOffsets,
  getTargetIndexByDraggingOffset,
} from '@blocksuite/affine-shared/utils';
import { IS_MOBILE } from '@blocksuite/global/env';
import type { UIEventStateContext } from '@blocksuite/std';
import { computed } from '@preact/signals-core';
import type { ReactiveController } from 'lit';

import { ColumnMinWidth, DefaultColumnWidth } from './consts';
import {
  type TableAreaSelection,
  TableSelection,
  TableSelectionData,
} from './selection-schema';
import type { TableBlockComponent } from './table-block';
import {
  createColumnDragPreview,
  createRowDragPreview,
  type TableCell,
  TableCellComponentName,
} from './table-cell';
import { cleanSelection } from './utils';
type Cells = string[][];
const TEXT = 'text/plain';
export class SelectionController implements ReactiveController {
  constructor(public readonly host: TableBlockComponent) {
    this.host.addController(this);
  }
  hostConnected() {
    this.dragListener();
    this.host.handleEvent('copy', this.onCopy);
    this.host.handleEvent('cut', this.onCut);
    this.host.handleEvent('paste', this.onPaste);
  }
  private get dataManager() {
    return this.host.dataManager;
  }
  private get clipboard() {
    return this.host.std.clipboard;
  }
  private get scale() {
    return this.host.getScale();
  }

  widthAdjust(dragHandle: HTMLElement, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const initialX = event.clientX;
    const currentWidth =
      dragHandle.closest('td')?.getBoundingClientRect().width ??
      DefaultColumnWidth;
    const adjustedWidth = currentWidth / this.scale;
    const columnId = dragHandle.dataset['widthAdjustColumnId'];
    if (!columnId) {
      return;
    }
    const onMove = (event: MouseEvent) => {
      this.dataManager.widthAdjustColumnId$.value = columnId;
      this.dataManager.virtualWidth$.value = {
        columnId,
        width: Math.max(
          ColumnMinWidth,
          (event.clientX - initialX) / this.scale + adjustedWidth
        ),
      };
    };
    const onUp = () => {
      const width = this.dataManager.virtualWidth$.value?.width;
      this.dataManager.widthAdjustColumnId$.value = undefined;
      this.dataManager.virtualWidth$.value = undefined;
      if (width) {
        this.dataManager.setColumnWidth(columnId, width);
      }

      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  dragListener() {
    if (IS_MOBILE || this.dataManager.readonly$.value) {
      return;
    }
    this.host.disposables.addFromEvent(this.host, 'mousedown', event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const widthAdjustColumn = target.closest('[data-width-adjust-column-id]');
      if (widthAdjustColumn instanceof HTMLElement) {
        this.widthAdjust(widthAdjustColumn, event);
        return;
      }
      const columnDragHandle = target.closest('[data-drag-column-id]');
      if (columnDragHandle instanceof HTMLElement) {
        this.columnDrag(columnDragHandle, event);
        return;
      }
      const rowDragHandle = target.closest('[data-drag-row-id]');
      if (rowDragHandle instanceof HTMLElement) {
        this.rowDrag(rowDragHandle, event);
        return;
      }
      this.onDragStart(event);
    });
  }
  startColumnDrag(x: number, columnDragHandle: HTMLElement) {
    const columnId = columnDragHandle.dataset['dragColumnId'];
    if (!columnId) {
      return;
    }
    const cellRect = columnDragHandle.closest('td')?.getBoundingClientRect();
    const containerRect = this.host.getBoundingClientRect();
    if (!cellRect) {
      return;
    }
    const initialDiffX = x - cellRect.left;
    const cells = Array.from(
      this.host.querySelectorAll(`td[data-column-id="${columnId}"]`)
    ).map(td => td.closest(TableCellComponentName) as TableCell);
    const firstCell = cells[0];
    if (!firstCell) {
      return;
    }
    const draggingIndex = firstCell.columnIndex;
    const columns = Array.from(
      this.host.querySelectorAll(`td[data-row-id="${firstCell?.row?.rowId}"]`)
    ).map(td => td.getBoundingClientRect());
    const columnOffsets = columns.flatMap((column, index) =>
      index === columns.length - 1 ? [column.left, column.right] : [column.left]
    );
    const columnDragPreview = createColumnDragPreview(cells);
    columnDragPreview.style.top = `${cellRect.top - containerRect.top - 0.5}px`;
    columnDragPreview.style.left = `${cellRect.left - containerRect.left}px`;
    columnDragPreview.style.width = `${cellRect.width}px`;
    this.host.append(columnDragPreview);
    document.body.style.pointerEvents = 'none';
    const onMove = (x: number) => {
      const { targetIndex, isForward } = getTargetIndexByDraggingOffset(
        columnOffsets,
        draggingIndex,
        x - initialDiffX
      );
      if (targetIndex != null) {
        this.dataManager.ui.columnIndicatorIndex$.value = isForward
          ? targetIndex + 1
          : targetIndex;
      } else {
        this.dataManager.ui.columnIndicatorIndex$.value = undefined;
      }
      columnDragPreview.style.left = `${x - initialDiffX - containerRect.left}px`;
    };
    const onEnd = () => {
      const targetIndex = this.dataManager.ui.columnIndicatorIndex$.value;
      this.dataManager.ui.columnIndicatorIndex$.value = undefined;
      document.body.style.pointerEvents = 'auto';
      columnDragPreview.remove();
      if (targetIndex != null) {
        this.dataManager.moveColumn(
          draggingIndex,
          targetIndex === 0 ? undefined : targetIndex - 1
        );
      }
    };
    return {
      onMove,
      onEnd,
    };
  }
  columnDrag(columnDragHandle: HTMLElement, event: MouseEvent) {
    let drag: { onMove: (x: number) => void; onEnd: () => void } | undefined =
      undefined;
    const initialX = event.clientX;
    const onMove = (event: MouseEvent) => {
      const diffX = event.clientX - initialX;
      if (!drag && Math.abs(diffX) > 10) {
        event.preventDefault();
        event.stopPropagation();
        cleanSelection();
        this.setSelected(undefined);
        drag = this.startColumnDrag(initialX, columnDragHandle);
      }
      drag?.onMove(event.clientX);
    };
    const onUp = () => {
      drag?.onEnd();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  startRowDrag(y: number, rowDragHandle: HTMLElement) {
    const rowId = rowDragHandle.dataset['dragRowId'];
    if (!rowId) {
      return;
    }
    const cellRect = rowDragHandle.closest('td')?.getBoundingClientRect();
    const containerRect = this.host.getBoundingClientRect();
    if (!cellRect) {
      return;
    }
    const initialDiffY = y - cellRect.top;
    const cells = Array.from(
      this.host.querySelectorAll(`td[data-row-id="${rowId}"]`)
    ).map(td => td.closest(TableCellComponentName) as TableCell);
    const firstCell = cells[0];
    if (!firstCell) {
      return;
    }
    const draggingIndex = firstCell.rowIndex;
    const rows = Array.from(
      this.host.querySelectorAll(
        `td[data-column-id="${firstCell?.column?.columnId}"]`
      )
    ).map(td => td.getBoundingClientRect());
    const rowOffsets = rows.flatMap((row, index) =>
      index === rows.length - 1 ? [row.top, row.bottom] : [row.top]
    );
    const rowDragPreview = createRowDragPreview(cells);
    rowDragPreview.style.left = `${cellRect.left - containerRect.left}px`;
    rowDragPreview.style.top = `${cellRect.top - containerRect.top - 0.5}px`;
    rowDragPreview.style.height = `${cellRect.height}px`;
    this.host.append(rowDragPreview);
    document.body.style.pointerEvents = 'none';
    const onMove = (y: number) => {
      const { targetIndex, isForward } = getTargetIndexByDraggingOffset(
        rowOffsets,
        draggingIndex,
        y - initialDiffY
      );
      if (targetIndex != null) {
        this.dataManager.ui.rowIndicatorIndex$.value = isForward
          ? targetIndex + 1
          : targetIndex;
      } else {
        this.dataManager.ui.rowIndicatorIndex$.value = undefined;
      }
      rowDragPreview.style.top = `${y - initialDiffY - containerRect.top}px`;
    };
    const onEnd = () => {
      const targetIndex = this.dataManager.ui.rowIndicatorIndex$.value;
      this.dataManager.ui.rowIndicatorIndex$.value = undefined;
      document.body.style.pointerEvents = 'auto';
      rowDragPreview.remove();
      if (targetIndex != null) {
        this.dataManager.moveRow(
          draggingIndex,
          targetIndex === 0 ? undefined : targetIndex - 1
        );
      }
    };
    return {
      onMove,
      onEnd,
    };
  }
  rowDrag(rowDragHandle: HTMLElement, event: MouseEvent) {
    let drag: { onMove: (x: number) => void; onEnd: () => void } | undefined =
      undefined;
    const initialY = event.clientY;
    const onMove = (event: MouseEvent) => {
      const diffY = event.clientY - initialY;
      if (!drag && Math.abs(diffY) > 10) {
        event.preventDefault();
        event.stopPropagation();
        cleanSelection();
        this.setSelected(undefined);
        drag = this.startRowDrag(initialY, rowDragHandle);
      }
      drag?.onMove(event.clientY);
    };
    // eslint-disable-next-line sonarjs/no-identical-functions
    const onUp = () => {
      drag?.onEnd();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  readonly doCopyOrCut = (selection: TableAreaSelection, isCut: boolean) => {
    const columns = this.dataManager.uiColumns$.value;
    const rows = this.dataManager.uiRows$.value;
    const cells: Cells = [];
    const deleteCells: { rowId: string; columnId: string }[] = [];
    for (let i = selection.rowStartIndex; i <= selection.rowEndIndex; i++) {
      const row = rows[i];
      if (!row) {
        continue;
      }
      const rowCells: string[] = [];
      for (
        let j = selection.columnStartIndex;
        j <= selection.columnEndIndex;
        j++
      ) {
        const column = columns[j];
        if (!column) {
          continue;
        }
        const cell = this.dataManager.getCell(row.rowId, column.columnId);
        rowCells.push(cell?.text.toString() ?? '');
        if (isCut) {
          deleteCells.push({ rowId: row.rowId, columnId: column.columnId });
        }
      }
      cells.push(rowCells);
    }
    if (isCut) {
      this.dataManager.clearCells(deleteCells);
    }
    const text = cells.map(row => row.join('\t')).join('\n');

    const htmlTable = `<table style="border-collapse: collapse;">
      <tbody>
        ${cells
          .map(
            row => `
          <tr>
            ${row
              .map(
                cell => `
              <td style="border: 1px solid var(--affine-border-color); padding: 8px 12px; min-width: ${DefaultColumnWidth}px; min-height: 22px;">${cell}</td>
            `
              )
              .join('')}
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>`;

    this.clipboard
      .writeToClipboard(items => ({
        ...items,
        [TEXT]: text,
        'text/html': htmlTable,
      }))
      .catch(console.error);
  };
  onCopy = () => {
    const selection = this.getSelected();
    if (!selection || selection.type !== 'area') {
      return false;
    }
    this.doCopyOrCut(selection, false);
    return true;
  };
  onCut = () => {
    const selection = this.getSelected();
    if (!selection || selection.type !== 'area') {
      return false;
    }
    this.doCopyOrCut(selection, true);
    return true;
  };
  doPaste = (plainText: string, selection: TableAreaSelection) => {
    try {
      const rowTextLists = plainText
        .split(/\r?\n/)
        .map(line => line.split('\t').map(cell => cell.trim()))
        .filter(row => row.some(cell => cell !== '')); // Filter out empty rows
      const height = rowTextLists.length;
      const width = rowTextLists[0]?.length ?? 0;
      if (height > 0 && width > 0) {
        const columns = this.dataManager.uiColumns$.value;
        const rows = this.dataManager.uiRows$.value;
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
            const text = this.dataManager.getCell(
              row.rowId,
              column.columnId
            )?.text;
            if (text) {
              const rowIndex = (i - selection.rowStartIndex) % height;
              const columnIndex = (j - selection.columnStartIndex) % width;
              text.replace(
                0,
                text.length,
                rowTextLists[rowIndex]?.[columnIndex] ?? ''
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  };
  onPaste = (_context: UIEventStateContext) => {
    const event = _context.get('clipboardState').raw;
    event.stopPropagation();
    const clipboardData = event.clipboardData;
    if (!clipboardData) return false;

    const selection = this.getSelected();
    if (!selection || selection.type !== 'area') {
      return false;
    }

    try {
      const html = clipboardData.getData('text/html');
      if (html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const table = doc.querySelector('table');
        if (table) {
          const rows: string[][] = [];
          table.querySelectorAll('tr').forEach(tr => {
            const rowData: string[] = [];
            tr.querySelectorAll('td,th').forEach(cell => {
              rowData.push(cell.textContent?.trim() ?? '');
            });
            if (rowData.length > 0) {
              rows.push(rowData);
            }
          });
          if (rows.length > 0) {
            this.doPaste(rows.map(row => row.join('\t')).join('\n'), selection);
            return true;
          }
        }
      }

      // If no HTML format or parsing failed, try to read plain text
      const plainText = clipboardData.getData('text/plain');
      if (plainText) {
        this.doPaste(plainText, selection);
        return true;
      }
    } catch (error) {
      console.error('Failed to paste:', error);
    }

    return false;
  };
  onDragStart(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const offsets = domToOffsets(this.host, 'tr', 'td');
    if (!offsets) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let selected = false;
    const initCell = target.closest('affine-table-cell');
    if (!initCell) {
      selected = true;
    }
    const onMove = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const cell = target.closest('affine-table-cell');
        if (!selected && initCell === cell) {
          return;
        }
        selected = true;
        const endX = event.clientX;
        const endY = event.clientY;
        const [left, right] = startX > endX ? [endX, startX] : [startX, endX];
        const [top, bottom] = startY > endY ? [endY, startY] : [startY, endY];
        const area = getAreaByOffsets(offsets, top, bottom, left, right);
        this.setSelected({
          type: 'area',
          rowStartIndex: area.top,
          rowEndIndex: area.bottom,
          columnStartIndex: area.left,
          columnEndIndex: area.right,
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  setSelected(
    selection: TableSelectionData | undefined,
    removeNativeSelection = true
  ) {
    if (selection) {
      const previous = this.getSelected();
      if (TableSelectionData.equals(previous, selection)) {
        return;
      }
      if (removeNativeSelection) {
        getSelection()?.removeAllRanges();
      }
      this.host.selection.set([
        new TableSelection({
          blockId: this.host.model.id,
          data: selection,
        }),
      ]);
    } else {
      this.host.selection.clear();
    }
  }
  selected$ = computed(() => this.getSelected());
  getSelected(): TableSelectionData | undefined {
    const selection = this.host.selection.value.find(
      selection => selection.blockId === this.host.model.id
    );
    return selection?.is(TableSelection) ? selection.data : undefined;
  }
}
