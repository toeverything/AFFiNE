// related component

import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import type { ReactiveController } from 'lit';

import { startDrag } from '../../../../core/utils/drag.js';
import { TableRowView } from '../row/row.js';
import type { TableViewUILogic } from '../table-view-ui-logic.js';

export class TableDragController implements ReactiveController {
  dragStart = (rowView: TableRowView, evt: PointerEvent) => {
    const eleRect = rowView.getBoundingClientRect();
    const offsetLeft = evt.x - eleRect.left;
    const offsetTop = evt.y - eleRect.top;
    const preview = createDragPreview(
      rowView,
      evt.x - offsetLeft,
      evt.y - offsetTop
    );
    const fromGroup = rowView.groupKey;

    startDrag<
      | undefined
      | {
          type: 'self';
          groupKey?: string;
          position: InsertToPosition;
        }
      | { type: 'out'; callback: () => void },
      PointerEvent
    >(evt, {
      onDrag: () => undefined,
      onMove: evt => {
        preview.display(evt.x - offsetLeft, evt.y - offsetTop);
        if (!this.host?.contains(evt.target as Node)) {
          const callback = this.logic.root.config.onDrag;
          if (callback) {
            this.dropPreview.remove();
            return {
              type: 'out',
              callback: callback(evt, rowView.rowId),
            };
          }
          return;
        }
        const result = this.showIndicator(evt);
        if (result) {
          return {
            type: 'self',
            groupKey: result.groupKey,
            position: result.position,
          };
        }
        return;
      },
      onClear: () => {
        preview.remove();
        this.dropPreview.remove();
      },
      onDrop: result => {
        if (!result) {
          return;
        }
        if (result.type === 'out') {
          result.callback();
          return;
        }
        if (result.type === 'self') {
          const row = this.logic.view.rowGetOrCreate(rowView.rowId);
          row.move(result.position, fromGroup, result.groupKey);
        }
      },
    });
  };

  dropPreview = createDropPreview();

  getInsertPosition = (
    evt: MouseEvent
  ):
    | {
        groupKey: string | undefined;
        position: InsertToPosition;
        y: number;
        width: number;
        x: number;
      }
    | undefined => {
    const y = evt.y;
    const tableRect = this.host
      ?.querySelector('affine-data-view-table-group')
      ?.getBoundingClientRect();
    const rows = this.host?.querySelectorAll('data-view-table-row');
    if (!rows || !tableRect || y < tableRect.top) {
      return;
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows.item(i);
      const rect = row.getBoundingClientRect();
      const mid = (rect.top + rect.bottom) / 2;
      if (y < rect.bottom) {
        return {
          groupKey: row.groupKey,
          position: {
            id: row.dataset.rowId as string,
            before: y < mid,
          },
          y: y < mid ? rect.top : rect.bottom,
          width: tableRect.width,
          x: tableRect.left,
        };
      }
    }
    return;
  };

  showIndicator = (evt: MouseEvent) => {
    const position = this.getInsertPosition(evt);
    if (position) {
      this.dropPreview.display(position.x, position.y, position.width);
    } else {
      this.dropPreview.remove();
    }
    return position;
  };

  constructor(private readonly logic: TableViewUILogic) {}

  get host() {
    return this.logic.ui$.value;
  }

  hostConnected() {
    this.host?.disposables.add(
      this.logic.handleEvent('dragStart', context => {
        if (this.logic.view.readonly$.value) {
          return;
        }
        const event = context.get('pointerState').raw;
        const target = event.target;
        if (
          target instanceof Element &&
          this.host?.contains(target) &&
          target.closest('.data-view-table-view-drag-handler')
        ) {
          event.preventDefault();
          const row = target.closest('data-view-table-row');
          if (row) {
            getSelection()?.removeAllRanges();
            this.dragStart(row, event);
          }
          return true;
        }
        return false;
      })
    );
  }
}

const createDragPreview = (row: TableRowView, x: number, y: number) => {
  const div = document.createElement('div');
  const cloneRow = new TableRowView();
  cloneRow.rowIndex = row.rowIndex;
  cloneRow.rowId = row.rowId;
  cloneRow.tableViewLogic = row.tableViewLogic;
  div.append(cloneRow);
  div.className = 'with-data-view-css-variable';
  div.style.width = `${row.getBoundingClientRect().width}px`;
  div.style.position = 'fixed';
  div.style.pointerEvents = 'none';
  div.style.opacity = '0.5';
  div.style.backgroundColor = 'var(--affine-background-primary-color)';
  div.style.boxShadow = 'var(--affine-shadow-2)';
  div.style.left = `${x}px`;
  div.style.top = `${y}px`;
  div.style.zIndex = '9999';
  document.body.append(div);
  return {
    display(x: number, y: number) {
      div.style.left = `${Math.round(x)}px`;
      div.style.top = `${Math.round(y)}px`;
    },
    remove() {
      div.remove();
    },
  };
};
const createDropPreview = () => {
  const div = document.createElement('div');
  div.dataset.isDropPreview = 'true';
  div.style.pointerEvents = 'none';
  div.style.position = 'fixed';
  div.style.zIndex = '9999';
  div.style.height = '2px';
  div.style.borderRadius = '1px';
  div.style.backgroundColor = 'var(--affine-primary-color)';
  div.style.boxShadow = '0px 0px 8px 0px rgba(30, 150, 235, 0.35)';
  return {
    display(x: number, y: number, width: number) {
      document.body.append(div);
      div.style.left = `${x}px`;
      div.style.top = `${y - 2}px`;
      div.style.width = `${width}px`;
    },
    remove() {
      div.remove();
    },
  };
};
