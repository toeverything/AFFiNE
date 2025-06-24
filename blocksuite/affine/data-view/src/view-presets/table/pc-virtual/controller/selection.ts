import { getRangeByPositions } from '@blocksuite/affine-shared/utils';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed, type ReadonlySignal } from '@preact/signals-core';
import type { ReactiveController } from 'lit';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { autoScrollOnBoundary } from '../../../../core/utils/auto-scroll.js';
import { startDrag } from '../../../../core/utils/drag.js';
import {
  type MultiSelection,
  RowWithGroup,
  TableViewAreaSelection,
  TableViewRowSelection,
  type TableViewSelection,
  type TableViewSelectionWithType,
} from '../../selection';
import type { DatabaseCellContainer } from '../row/cell';
import type { VirtualTableViewUILogic } from '../table-view-ui-logic.js';
import type { TableGridCell } from '../types.js';
import {
  DragToFillElement,
  fillSelectionWithFocusCellData,
} from './drag-to-fill.js';

export class TableSelectionController implements ReactiveController {
  disposables = new DisposableGroup();
  private _tableViewSelection?: TableViewSelectionWithType;

  private readonly getFocusCellContainer = () => {
    if (
      !this._tableViewSelection ||
      this._tableViewSelection.selectionType !== 'area'
    )
      return null;
    const { groupKey, focus } = this._tableViewSelection;

    const dragStartCell = this.getCellContainer(
      groupKey,
      focus.rowIndex,
      focus.columnIndex
    );
    return dragStartCell ?? null;
  };

  __dragToFillElement = new DragToFillElement();

  __selectionElement;

  selectionStyleUpdateTask = 0;

  // private get areaSelectionElement() {
  //   return this.__selectionElement;
  // }

  get dragToFillDraggable() {
    return this.__dragToFillElement.dragToFillRef.value;
  }

  // private get focusSelectionElement() {
  //   return this.__selectionElement;
  // }

  get selection(): TableViewSelectionWithType | undefined {
    return this._tableViewSelection;
  }

  set selection(data: TableViewSelection | undefined) {
    if (!data) {
      this.clearSelection();
      return;
    }
    const selection: TableViewSelectionWithType = {
      ...data,
      viewId: this.view.id,
      type: 'table',
    };
    if (selection.selectionType === 'area' && selection.isEditing) {
      const focus = selection.focus;
      const container = this.getCellContainer(
        selection.groupKey,
        focus.rowIndex,
        focus.columnIndex
      );
      const cell = container?.cell;
      const isEditing = cell ? cell.beforeEnterEditMode() : true;
      this.logic.setSelection({
        ...selection,
        isEditing,
      });
    } else {
      this.logic.setSelection(selection);
    }
  }

  get tableContainer() {
    return this.virtualScroll?.content.parentElement;
  }

  get view() {
    return this.logic.view;
  }

  constructor(public logic: VirtualTableViewUILogic) {
    this.__selectionElement = new SelectionElement();
    this.__selectionElement.controller = this;
  }

  get host() {
    return this.logic.ui$.value;
  }

  private clearSelection() {
    this.logic.setSelection();
  }

  private handleDragEvent() {
    this.disposables.add(
      this.logic.handleEvent('dragStart', context => {
        if (this.logic.view.readonly$.value) {
          return;
        }
        const event = context.get('pointerState').raw;
        const target = event.target;
        if (target instanceof HTMLElement) {
          const [cell, fillValues] = this.resolveDragStartTarget(target);

          if (cell) {
            const selection = this.selection;
            if (
              selection &&
              selection.selectionType === 'area' &&
              selection.isEditing &&
              selection.focus.rowIndex === cell.rowIndex$.value &&
              selection.focus.columnIndex === cell.columnIndex$.value
            ) {
              return false;
            }
            this.startDrag(event, cell, fillValues);
            event.preventDefault();
            return true;
          }
          return false;
        }
        return false;
      })
    );
  }

  private handleSelectionChange() {
    this.disposables.add(
      this.logic.selection$.subscribe(tableSelection => {
        if (!this.isValidSelection(tableSelection)) {
          this.selection = undefined;
          return;
        }
        const old =
          this._tableViewSelection?.selectionType === 'area'
            ? this._tableViewSelection
            : undefined;
        const newSelection =
          tableSelection?.selectionType === 'area' ? tableSelection : undefined;
        if (
          old?.focus.rowIndex !== newSelection?.focus.rowIndex ||
          old?.focus.columnIndex !== newSelection?.focus.columnIndex
        ) {
          requestAnimationFrame(() => {
            this.scrollToFocus();
          });
        }

        if (
          this.isRowSelection() &&
          (old?.rowsSelection?.start !== newSelection?.rowsSelection?.start ||
            old?.rowsSelection?.end !== newSelection?.rowsSelection?.end)
        ) {
          requestAnimationFrame(() => {
            this.scrollToAreaSelection();
          });
        }

        if (old) {
          const container = this.getCellContainer(
            old.groupKey,
            old.focus.rowIndex,
            old.focus.columnIndex
          );
          if (container) {
            const cell = container.cell;
            if (old.isEditing) {
              cell?.beforeExitEditingMode();
              cell?.blurCell();
              container.isEditing$.value = false;
            }
          }
        }
        this._tableViewSelection = tableSelection;

        if (newSelection) {
          const container = this.getCellContainer(
            newSelection.groupKey,
            newSelection.focus.rowIndex,
            newSelection.focus.columnIndex
          );
          if (container) {
            const cell = container.cell;
            if (newSelection.isEditing) {
              container.isEditing$.value = true;
              requestAnimationFrame(() => {
                cell?.afterEnterEditingMode();
                cell?.focusCell();
              });
            }
          }
        }
      })
    );
  }

  private insertTo(
    groupKey: string | undefined,
    rowId: string,
    before: boolean
  ) {
    const id = this.view.rowAdd({ before, id: rowId });
    if (groupKey != null) {
      this.view.groupTrait.moveCardTo(id, undefined, groupKey, {
        before,
        id: rowId,
      });
    }
    const rows =
      groupKey != null
        ? this.view.groupTrait.groupDataMap$.value?.[groupKey]?.rows
        : this.view.rows$.value;
    requestAnimationFrame(() => {
      const index = this.view.properties$.value.findIndex(
        v => v.type$.value === 'title'
      );
      this.selection = TableViewAreaSelection.create({
        groupKey: groupKey,
        focus: {
          rowIndex: rows?.findIndex(v => v.rowId === id) ?? 0,
          columnIndex: index,
        },
        isEditing: true,
      });
    });
  }

  private resolveDragStartTarget(
    target: HTMLElement
  ): [cell: DatabaseCellContainer | null, fillValues: boolean] {
    let cell: DatabaseCellContainer | null;
    const fillValues = !!target.dataset.dragToFill;
    if (fillValues) {
      const focusCellContainer = this.getFocusCellContainer();
      cell = focusCellContainer ?? null;
    } else {
      cell = target.closest('affine-database-virtual-cell-container');
    }
    return [cell, fillValues];
  }

  private scrollToAreaSelection() {
    // this.areaSelectionElement?.scrollIntoView({
    //   block: 'nearest',
    //   inline: 'nearest',
    // });
  }

  private scrollToFocus() {
    // this.focusSelectionElement?.scrollIntoView({
    //   block: 'nearest',
    //   inline: 'nearest',
    // });
  }

  areaToRows(selection: TableViewAreaSelection) {
    const rows = this.rows(selection.groupKey ?? '') ?? [];
    const ids = Array.from({
      length: selection.rowsSelection.end - selection.rowsSelection.start + 1,
    })
      .map((_, index) => index + selection.rowsSelection.start)
      .map(row => rows[row]?.rowId)
      .filter((id): id is string => id != null);
    return ids.map(id => ({ id, groupKey: selection.groupKey }));
  }

  readonly columnPositions$ = computed(() => {
    const columnPositions = this.virtualScroll?.columnPosition$.value?.slice(1);
    if (columnPositions == null) {
      return [];
    }
    return columnPositions;
  });

  readonly columnOffsets$ = computed(() => {
    const columnPositions = this.columnPositions$.value;
    if (columnPositions == null) {
      return [];
    }
    const firstLeft = columnPositions[0]?.left;
    if (firstLeft == null) {
      return [];
    }
    const rights = columnPositions.map(v => v.right);
    if (rights == null) {
      return [];
    }
    return [firstLeft, ...rights];
  });

  readonly groupRowOffsets$ = computed<
    Record<string, ReadonlySignal<number[]>>
  >(() => {
    return Object.fromEntries(
      this.virtualScroll?.groups$.value.map(group => {
        return [
          group.groupId,
          computed(() => {
            const firstTop = group.rowsTop$.value;
            if (firstTop == null) {
              return [];
            }
            const offsets: number[] = [firstTop];
            for (const row of group.rows$.value) {
              if (row.bottom$.value == null) {
                break;
              }
              offsets.push(row.bottom$.value);
            }
            return offsets;
          }),
        ];
      }) ?? []
    );
  });

  cellPosition(groupKey: string | undefined) {
    const containerRect = this.virtualScroll?.content.getBoundingClientRect();
    if (containerRect == null) {
      return;
    }
    return (x1: number, x2: number, y1: number, y2: number) => {
      x1 = x1 - containerRect.left;
      x2 = x2 - containerRect.left;
      y1 = y1 - containerRect.top;
      y2 = y2 - containerRect.top;
      const rowOffsets = this.groupRowOffsets$.value[groupKey ?? ''];
      if (rowOffsets == null) {
        return;
      }
      const [startX, endX] = x1 < x2 ? [x1, x2] : [x2, x1];
      const [startY, endY] = y1 < y2 ? [y1, y2] : [y2, y1];
      const column = getRangeByPositions(
        this.columnOffsets$.value,
        startX,
        endX
      );
      const row = getRangeByPositions(rowOffsets.value, startY, endY);
      return {
        row,
        column,
      };
    };
  }

  clear() {
    this.selection = undefined;
  }

  deleteRow(rowId: string) {
    this.view.rowsDelete([rowId]);
    this.focusToCell('up');
    this.logic.ui$.value?.requestUpdate();
  }

  focusFirstCell() {
    this.selection = TableViewAreaSelection.create({
      focus: {
        rowIndex: 0,
        columnIndex: 0,
      },
      isEditing: false,
    });
  }

  focusToArea(selection: TableViewAreaSelection) {
    return {
      ...selection,
      rowsSelection: selection.rowsSelection ?? {
        start: selection.focus.rowIndex,
        end: selection.focus.rowIndex,
      },
      columnsSelection: selection.columnsSelection ?? {
        start: selection.focus.columnIndex,
        end: selection.focus.columnIndex,
      },
      isEditing: false,
    } satisfies TableViewAreaSelection;
  }

  focusToCell(position: 'left' | 'right' | 'up' | 'down') {
    if (!this.selection || this.selection.selectionType !== 'area') {
      return;
    }
    const cell = this.getCellContainer(
      this.selection.groupKey,
      this.selection.focus.rowIndex,
      this.selection.focus.columnIndex
    );
    if (!cell) {
      return;
    }
    const row = cell.gridCell.row;
    const rows = row.group.rows$.value;
    let rowIndex = row.rowIndex$.value;
    let columnIndex = cell.columnIndex$.value;
    const columns = this.columnPositions$.value;
    if (position === 'left') {
      if (columnIndex === 0) {
        columnIndex = columns.length - 1;
        rowIndex--;
      } else {
        columnIndex--;
      }
    }
    if (position === 'right') {
      if (columnIndex === columns.length - 1) {
        columnIndex = 0;
        rowIndex++;
      } else {
        columnIndex++;
      }
    }
    if (position === 'up') {
      if (rowIndex === 0) {
        //
      } else {
        rowIndex--;
      }
    }
    if (position === 'down') {
      if (rowIndex === rows.length - 1) {
        //
      } else {
        rowIndex++;
      }
    }
    const cellContainer = this.getCellContainer(
      this.selection.groupKey,
      rowIndex,
      columnIndex
    );
    if (!cellContainer) {
      return;
    }
    cellContainer.selectCurrentCell(false);
  }

  getCellElement(cell: TableGridCell): DatabaseCellContainer | undefined {
    return (
      cell.element.querySelector('affine-database-virtual-cell-container') ??
      undefined
    );
  }

  getCellByIndex(
    groupKey: string | undefined,
    rowIndex: number,
    columnIndex: number
  ): TableGridCell | undefined {
    const row = this.rows(groupKey)?.[rowIndex];
    if (!row) {
      return;
    }
    const cell = row.cells$.value[columnIndex + 1];
    return cell;
  }

  getCellContainer(
    groupKey: string | undefined,
    rowIndex: number,
    columnIndex: number
  ): DatabaseCellContainer | undefined {
    const cell = this.getCellByIndex(groupKey, rowIndex, columnIndex);
    if (!cell) {
      return;
    }
    return this.getCellElement(cell);
  }

  getRect(
    groupKey: string | undefined,
    topIndex: number,
    bottomIndex: number,
    leftIndex: number,
    rightIndex: number
  ):
    | undefined
    | {
        top: number;
        left: number;
        width: number;
        height: number;
        scale: number;
      } {
    const rows = this.rows(groupKey);
    const top = rows?.[topIndex]?.top$.value;
    const bottom = rows?.[bottomIndex]?.bottom$.value;
    if (top == null || bottom == null) {
      return;
    }
    const left = this.columnPositions$.value[leftIndex]?.left;
    const right = this.columnPositions$.value[rightIndex]?.right;
    if (left == null || right == null) {
      return;
    }
    return {
      top,
      left,
      width: right - left,
      height: bottom - top,
      scale: 1,
    };
  }

  getSelectionAreaBorder(position: 'left' | 'right' | 'top' | 'bottom') {
    return this.__selectionElement?.querySelector(
      `.area-border.area-${position}`
    );
  }

  hostConnected() {
    requestAnimationFrame(() => {
      this.tableContainer?.append(this.__selectionElement);
      this.tableContainer?.append(this.__dragToFillElement);
    });
    this.handleDragEvent();
    this.handleSelectionChange();
  }

  insertRowAfter(groupKey: string | undefined, rowId: string) {
    this.insertTo(groupKey, rowId, false);
  }

  insertRowBefore(groupKey: string | undefined, rowId: string) {
    this.insertTo(groupKey, rowId, true);
  }

  isRowSelection() {
    return this.selection?.selectionType === 'row';
  }

  isValidSelection(selection?: TableViewSelectionWithType): boolean {
    if (!selection || selection.selectionType === 'row') {
      return true;
    }
    if (selection.focus.rowIndex > this.view.rows$.value.length - 1) {
      this.selection = undefined;
      return false;
    }
    if (selection.focus.columnIndex > this.view.propertyIds$.value.length - 1) {
      this.selection = undefined;
      return false;
    }
    return true;
  }

  navigateRowSelection(direction: 'up' | 'down', append = false) {
    if (!TableViewRowSelection.is(this.selection)) return;
    const rows = this.selection.rows;
    const lastRow = rows[rows.length - 1];
    if (!lastRow) return;
    const lastRowIndex =
      this.getGroup(lastRow?.groupKey)?.rows$.value.find(
        r => r.rowId === lastRow?.id
      )?.rowIndex$.value ?? 0;
    const getRowByIndex = (index: number) => {
      const tableRow = this.rows(lastRow?.groupKey)?.[index];
      if (!tableRow) {
        return;
      }
      return {
        id: tableRow.rowId,
        groupKey: lastRow?.groupKey,
      };
    };
    const prevRow = getRowByIndex(lastRowIndex - 1);
    const nextRow = getRowByIndex(lastRowIndex + 1);
    const includes = (row: RowWithGroup) => {
      if (!row) {
        return false;
      }
      return rows.some(r => RowWithGroup.equal(r, row));
    };
    if (append) {
      const addList: RowWithGroup[] = [];
      const removeList: RowWithGroup[] = [];
      if (direction === 'up' && prevRow != null) {
        if (includes(prevRow)) {
          removeList.push(lastRow);
        } else {
          addList.push(prevRow);
        }
      }
      if (direction === 'down' && nextRow != null) {
        if (includes(nextRow)) {
          removeList.push(lastRow);
        } else {
          addList.push(nextRow);
        }
      }
      this.rowSelectionChange({ add: addList, remove: removeList });
    } else {
      const target = direction === 'up' ? prevRow : nextRow;
      if (target != null) {
        this.selection = TableViewRowSelection.create({
          rows: [target],
        });
      }
    }
  }

  get virtualScroll() {
    return this.logic.virtualScroll$.value;
  }

  getGroup(groupKey: string | undefined) {
    return this.virtualScroll?.getGroup(groupKey ?? '');
  }

  getRow(groupKey: string | undefined, rowId: string) {
    return this.virtualScroll?.getRow(groupKey ?? '', rowId);
  }

  getCell(groupKey: string | undefined, rowId: string, columnId: string) {
    return this.virtualScroll?.getCell(groupKey ?? '', rowId, columnId);
  }

  rows(groupKey: string | undefined) {
    return this.virtualScroll?.getGroup(groupKey ?? '').rows$.value;
  }

  rowSelectionChange({
    add,
    remove,
  }: {
    add: RowWithGroup[];
    remove: RowWithGroup[];
  }) {
    const key = (r: RowWithGroup) => `${r.id}.${r.groupKey ? r.groupKey : ''}`;
    const rows = new Set(
      TableViewRowSelection.rows(this.selection).map(r => key(r))
    );
    remove.forEach(row => rows.delete(key(row)));
    add.forEach(row => rows.add(key(row)));
    const result = [...rows]
      .map(r => r.split('.'))
      .flatMap(([id, groupKey]) => {
        if (id == null) return [];
        return [
          {
            id,
            groupKey: groupKey ? groupKey : undefined,
          },
        ];
      });
    this.selection = TableViewRowSelection.create({
      rows: result,
    });
  }

  rowsToArea(rows: string[]):
    | {
        start: number;
        end: number;
        groupKey?: string;
      }
    | undefined {
    let groupKey: string | undefined = undefined;
    let minIndex: number | undefined = undefined;
    let maxIndex: number | undefined = undefined;
    const set = new Set(rows);
    if (!this.tableContainer) return;
    for (const row of this.tableContainer
      ?.querySelectorAll('data-view-table-row')
      .values() ?? []) {
      if (!set.has(row.rowId)) {
        continue;
      }
      minIndex =
        minIndex != null ? Math.min(minIndex, row.rowIndex) : row.rowIndex;
      maxIndex =
        maxIndex != null ? Math.max(maxIndex, row.rowIndex) : row.rowIndex;
      if (groupKey == null) {
        groupKey = row.groupKey;
      } else if (groupKey !== row.groupKey) {
        return;
      }
    }
    if (minIndex == null || maxIndex == null) {
      return;
    }
    return {
      groupKey,
      start: minIndex,
      end: maxIndex,
    };
  }

  selectionAreaDown() {
    const selection = this.selection;
    if (!selection || selection.selectionType !== 'area') {
      return;
    }
    const newSelection = this.focusToArea(selection);
    if (newSelection.rowsSelection.start === newSelection.focus.rowIndex) {
      newSelection.rowsSelection.end = Math.min(
        (this.rows(newSelection.groupKey)?.length ?? 0) - 1,
        newSelection.rowsSelection.end + 1
      );
      // requestAnimationFrame(() => {
      //   this.getSelectionAreaBorder('bottom')?.scrollIntoView({
      //     block: 'nearest',
      //     inline: 'nearest',
      //     behavior: 'smooth',
      //   });
      // });
    } else {
      newSelection.rowsSelection.start += 1;
      // requestAnimationFrame(() => {
      //   this.getSelectionAreaBorder('top')?.scrollIntoView({
      //     block: 'nearest',
      //     inline: 'nearest',
      //     behavior: 'smooth',
      //   });
      // });
    }
    this.selection = newSelection;
  }

  selectionAreaLeft() {
    const selection = this.selection;
    if (!selection || selection.selectionType !== 'area') {
      return;
    }
    const newSelection = this.focusToArea(selection);
    if (newSelection.columnsSelection.end === newSelection.focus.columnIndex) {
      newSelection.columnsSelection.start = Math.max(
        0,
        newSelection.columnsSelection.start - 1
      );
      // requestAnimationFrame(() => {
      //   this.getSelectionAreaBorder('left')?.scrollIntoView({
      //     block: 'nearest',
      //     inline: 'nearest',
      //     behavior: 'smooth',
      //   });
      // });
    } else {
      newSelection.columnsSelection.end -= 1;
      // requestAnimationFrame(() => {
      //   this.getSelectionAreaBorder('right')?.scrollIntoView({
      //     block: 'nearest',
      //     inline: 'nearest',
      //     behavior: 'smooth',
      //   });
      // });
    }
    this.selection = newSelection;
  }

  selectionAreaRight() {
    const selection = this.selection;
    if (!selection || selection.selectionType !== 'area') {
      return;
    }
    const newSelection = this.focusToArea(selection);
    if (
      newSelection.columnsSelection.start === newSelection.focus.columnIndex
    ) {
      const max = (this.virtualScroll?.columns$.value.length ?? 0) - 1;
      newSelection.columnsSelection.end = Math.min(
        max,
        newSelection.columnsSelection.end + 1
      );
      // requestAnimationFrame(() => {
      //   this.getSelectionAreaBorder('right')?.scrollIntoView({
      //     block: 'nearest',
      //     inline: 'nearest',
      //     behavior: 'smooth',
      //   });
      // });
    } else {
      newSelection.columnsSelection.start += 1;
      // requestAnimationFrame(() => {
      //   this.getSelectionAreaBorder('left')?.scrollIntoView({
      //     block: 'nearest',
      //     inline: 'nearest',
      //     behavior: 'smooth',
      //   });
      // });
    }
    this.selection = newSelection;
  }

  selectionAreaUp() {
    const selection = this.selection;
    if (!selection || selection.selectionType !== 'area') {
      return;
    }
    const newSelection = this.focusToArea(selection);
    if (newSelection.rowsSelection.end === newSelection.focus.rowIndex) {
      newSelection.rowsSelection.start = Math.max(
        0,
        newSelection.rowsSelection.start - 1
      );
      // requestAnimationFrame(() => {
      //   this.getSelectionAreaBorder('top')?.scrollIntoView({
      //     block: 'nearest',
      //     inline: 'nearest',
      //     behavior: 'smooth',
      //   });
      // });
    } else {
      newSelection.rowsSelection.end -= 1;
      // requestAnimationFrame(() => {
      //   this.getSelectionAreaBorder('bottom')?.scrollIntoView({
      //     block: 'nearest',
      //     inline: 'nearest',
      //     behavior: 'smooth',
      //   });
      // });
    }
    this.selection = newSelection;
  }

  startDrag(
    evt: PointerEvent,
    cell: DatabaseCellContainer,
    fillValues?: boolean
  ) {
    const groupKey = cell.groupKey;
    const table = this.tableContainer;
    const scrollContainer = table?.parentElement;
    if (!table || !scrollContainer) {
      return;
    }
    const tableRect = table.getBoundingClientRect();
    const startOffsetX = evt.x - tableRect.left;
    const startOffsetY = evt.y - tableRect.top;
    const offsetToSelection = this.cellPosition(groupKey);
    const select = (selection: {
      row: MultiSelection;
      column: MultiSelection;
    }) => {
      this.selection = TableViewAreaSelection.create({
        groupKey: groupKey,
        rowsSelection: selection.row,
        columnsSelection: selection.column,
        focus: {
          rowIndex: cell.rowIndex$.value,
          columnIndex: cell.columnIndex$.value,
        },
        isEditing: false,
      });
    };
    const drag = startDrag<
      | {
          row: MultiSelection;
          column: MultiSelection;
        }
      | undefined,
      {
        x: number;
        y: number;
      }
    >(evt, {
      transform: evt => ({
        x: evt.x,
        y: evt.y,
      }),
      onDrag: () => {
        if (fillValues) this.__dragToFillElement.dragging = true;
        return undefined;
      },
      onMove: ({ x, y }) => {
        if (!table) return;
        const tableRect = table.getBoundingClientRect();
        const startX = tableRect.left + startOffsetX;
        const startY = tableRect.top + startOffsetY;
        const selection = offsetToSelection?.(startX, x, startY, y);
        if (!selection) {
          return;
        }
        if (fillValues)
          selection.column = {
            start: cell.columnIndex$.value,
            end: cell.columnIndex$.value,
          };

        select(selection);
        return selection;
      },
      onDrop: selection => {
        if (!selection) {
          return;
        }
        select(selection);
        if (fillValues && this.selection) {
          this.__dragToFillElement.dragging = false;
          fillSelectionWithFocusCellData(
            this.logic,
            TableViewAreaSelection.create({
              groupKey: groupKey,
              rowsSelection: selection.row,
              columnsSelection: selection.column,
              focus: {
                rowIndex: cell.rowIndex$.value,
                columnIndex: cell.columnIndex$.value,
              },
              isEditing: false,
            })
          );
        }
      },
      onClear: () => {
        cancelScroll();
      },
    });
    const cancelScroll = autoScrollOnBoundary(
      scrollContainer,
      computed(() => {
        return {
          left: drag.mousePosition.value.x,
          right: drag.mousePosition.value.x,
          top: drag.mousePosition.value.y,
          bottom: drag.mousePosition.value.y,
        };
      }),
      {
        onScroll() {
          drag.move({ x: drag.last.x, y: drag.last.y });
        },
      }
    );
  }

  toggleRow(rowId: string, groupKey?: string) {
    const row = {
      id: rowId,
      groupKey,
    };
    const isSelected = TableViewRowSelection.includes(this.selection, row);
    this.rowSelectionChange({
      add: isSelected ? [] : [row],
      remove: isSelected ? [row] : [],
    });
  }
}

export class SelectionElement extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    data-view-virtual-table-selection {
      display: block;
      position: absolute;
      left: 0;
      top: 0;
    }
    .database-selection {
      position: absolute;
      z-index: 2;
      box-sizing: border-box;
      background-color: var(--affine-primary-color-04);
      pointer-events: none;
      display: none;
    }

    .database-focus {
      position: absolute;
      z-index: 2;
      box-sizing: border-box;
      border: 1px solid var(--affine-primary-color);
      border-radius: 2px;
      pointer-events: none;
      outline: none;
      display: none;
    }
  `;

  get virtualScroll() {
    return this.controller.virtualScroll;
  }

  focusPosition$ = computed(() => {
    const selection = this.selection$.value;
    if (selection?.selectionType !== 'area') {
      return;
    }
    const focus = selection.focus;
    const groupKey = selection.groupKey;
    const group = this.controller.getGroup(groupKey);
    if (!group) {
      return;
    }
    const row = group.rows$.value[focus.rowIndex];
    if (!row) {
      return;
    }
    const columnPosition =
      this.controller.columnPositions$.value[focus.columnIndex];
    if (!columnPosition) {
      return;
    }
    const left = columnPosition.left;
    const top = row.top$.value;
    const width = columnPosition.width;
    const height = row.height$.value;
    if (left == null || top == null || width == null || height == null) {
      return;
    }
    const paddingLeft = this.controller.logic.root.config.virtualPadding$.value;
    return {
      left: left + paddingLeft,
      top,
      width,
      height,
      editing: selection.isEditing,
    };
  });

  areaPosition$ = computed(() => {
    const selection = this.selection$.value;
    if (selection?.selectionType !== 'area') {
      return;
    }
    const groupKey = selection.groupKey;
    const group = this.controller.getGroup(groupKey);
    if (!group) {
      return;
    }
    const rect = this.controller.getRect(
      groupKey,
      selection.rowsSelection.start,
      selection.rowsSelection.end,
      selection.columnsSelection.start,
      selection.columnsSelection.end
    );
    if (!rect) {
      return;
    }
    const paddingLeft = this.controller.logic.root.config.virtualPadding$.value;
    return {
      left: rect.left + paddingLeft,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });

  get selection$() {
    return this.controller.logic.selection$;
  }

  override render() {
    const focus = this.focusPosition$.value;
    const focusStyle = focus
      ? styleMap({
          left: `${focus.left}px`,
          top: `${focus.top}px`,
          width: `${focus.width}px`,
          height: `${focus.height}px`,
          display: 'block',
          boxShadow: focus.editing
            ? '0px 0px 0px 2px rgba(30, 150, 235, 0.30)'
            : 'unset',
        })
      : undefined;
    const area = this.areaPosition$.value;
    const areaStyle = area
      ? styleMap({
          left: `${area.left}px`,
          top: `${area.top}px`,
          width: `${area.width}px`,
          height: `${area.height}px`,
          display: 'block',
        })
      : undefined;
    return html`
      <div class="database-selection" style=${areaStyle}></div>
      <div tabindex="0" class="database-focus" style=${focusStyle}></div>
    `;
  }

  @property({ attribute: false })
  accessor controller!: TableSelectionController;
}

declare global {
  interface HTMLElementTagNameMap {
    'data-view-virtual-table-selection': SelectionElement;
  }
}
