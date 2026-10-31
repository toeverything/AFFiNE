// Story 2.8: list-view row drag-to-reorder and drag-to-reindent.
//
// Modeled directly on `table/pc/controller/drag.ts` (same `startDrag`
// primitive, same handle-gating/drop-indicator/drag-preview shape), with
// two deliberate departures — see the story's own Resolved Design
// Decisions 1 and 2 for the full rationale:
//   1. No group plumbing at all — list view has no group-by concept, so
//      rows use the base `RowBase.move(position)` single-arg signature,
//      not `TableRow`'s group-aware override.
//   2. A genuinely new horizontal drag-to-indent gesture — table's own
//      controller always snaps the moved row to the hover target's level;
//      this one additionally reads horizontal cursor offset (measured from
//      the reference row's own rendered text start) to let the user
//      indent/promote by dragging left or right, clamped between "sibling
//      of the reference row" (no horizontal offset) and "child of the
//      reference row" (one level deeper), matching AC5.
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { TASK_HIERARCHY_LEVEL_COLUMN_NAME } from '@blocksuite/affine-shared/utils';
import type { ReactiveController } from 'lit';

import { startDrag } from '../../../../core/utils/drag.js';
import type { ListViewUILogic } from '../list-view-ui-logic.js';

// Matches `list/pc/renderer.ts`'s own render-time indent unit
// (`getHierarchyLevel(row.rowId) * 24`) — reused here, not reintroduced,
// so the live drag preview's indent steps land exactly where the row will
// actually render once dropped.
const LEVEL_INDENT_PX = 24;

/**
 * 999.4: index of the row under a pointer at `y` -- the row whose
 * [top, bottom) contains it, else the first row below it (gaps), else -1.
 *
 * Must be coordinate-based: during a TOUCH drag the pointer is implicitly
 * captured to the drag handle the gesture started on, so `pointermove`'s
 * `evt.target` stays inside the dragged row for the whole gesture and
 * `evt.target.closest(row)` always resolved the dragged row itself (rows
 * could not be moved above/below others or re-levelled on mobile).
 */
export function pickRowIndexAtY(
  rows: ReadonlyArray<{ top: number; bottom: number }>,
  y: number
): number {
  return rows.findIndex(row => y < row.bottom);
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export class ListDragController implements ReactiveController {
  private getHierarchyLevelByRowId(rowId: string) {
    const hierarchyProperty = this.logic.view.propertiesRaw$.value.find(
      property => property.name$.value === TASK_HIERARCHY_LEVEL_COLUMN_NAME
    );
    if (!hierarchyProperty) {
      return 0;
    }
    const raw = hierarchyProperty.cellGetOrCreate(rowId).jsonValue$.value;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return Math.max(0, Math.floor(raw));
    }
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.floor(parsed));
      }
    }
    return 0;
  }

  dragStart = (rowEle: HTMLElement, evt: PointerEvent) => {
    const rowId = rowEle.dataset.rowId;
    if (!rowId) {
      return;
    }
    const eleRect = rowEle.getBoundingClientRect();
    const offsetLeft = evt.clientX - eleRect.left;
    const offsetTop = evt.clientY - eleRect.top;
    const preview = createDragPreview(
      rowEle,
      evt.clientX - offsetLeft,
      evt.clientY - offsetTop
    );

    startDrag<
      | undefined
      | { type: 'self'; position: InsertToPosition; level: number }
      | { type: 'out'; callback: () => void },
      PointerEvent
    >(evt, {
      onDrag: () => undefined,
      onMove: evt => {
        preview.display(evt.clientX - offsetLeft, evt.clientY - offsetTop);
        if (!this.host?.contains(evt.target as Node)) {
          const callback = this.logic.root.config.onDrag;
          if (callback) {
            this.dropPreview.remove();
            return {
              type: 'out',
              callback: callback(evt, rowId),
            };
          }
          return;
        }
        const result = this.showIndicator(evt);
        if (result) {
          return {
            type: 'self',
            position: result.position,
            level: result.level,
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
          const dataSource = this.logic.view.manager.dataSource as {
            setPendingHierarchyLevel?: (rowId: string, level: number) => void;
          };
          dataSource.setPendingHierarchyLevel?.(rowId, result.level);
          const row = this.logic.view.rowGetOrCreate(rowId);
          row.move(result.position);
        }
      },
    });
  };

  dropPreview = createDropPreview();

  getInsertPosition = (
    evt: MouseEvent
  ):
    | {
        position: InsertToPosition;
        level: number;
        y: number;
        width: number;
        x: number;
      }
    | undefined => {
    const y = evt.clientY;
    const listRect = this.host
      ?.querySelector('.affine-data-view-list')
      ?.getBoundingClientRect();
    const rows = this.host?.querySelectorAll<HTMLElement>(
      '.affine-data-view-list-row'
    );
    if (!rows || !listRect || y < listRect.top) {
      return;
    }

    // Story 2.8 (Resolved Design Decision 2): the candidate indent level
    // for a given reference row — `before`/`after` placement matches
    // table's own vertical-midpoint logic exactly (AC4); the horizontal
    // component is new (AC5): zero offset (measured from the reference
    // row's own rendered title start, not the list's outer edge) keeps
    // the moved row a sibling of the reference row, dragging right nests
    // it one level deeper per `LEVEL_INDENT_PX` crossed (up to becoming
    // the reference row's own child), dragging left promotes it shallower
    // (down to level 0).
    const resolve = (row: HTMLElement) => {
      const rect = row.getBoundingClientRect();
      const mid = (rect.top + rect.bottom) / 2;
      const before = y < mid;
      const refRowId = row.dataset.rowId as string;
      const refLevel = this.getHierarchyLevelByRowId(refRowId);
      const titleRect = row
        .querySelector('.affine-data-view-list-title')
        ?.getBoundingClientRect();
      const refLeftEdgeX = titleRect?.left ?? rect.left;
      const maxLevel = before ? refLevel : refLevel + 1;
      const horizontalOffsetPx = evt.clientX - refLeftEdgeX;
      const levelDelta = Math.round(horizontalOffsetPx / LEVEL_INDENT_PX);
      const level = clamp(refLevel + levelDelta, 0, maxLevel);
      return {
        position: {
          id: refRowId,
          before,
        },
        level,
        y: before ? rect.top : rect.bottom,
        width: Math.max(48, listRect.width - level * LEVEL_INDENT_PX),
        x: listRect.left + level * LEVEL_INDENT_PX,
      };
    };

    // 999.4: by coordinates, never `evt.target` -- see pickRowIndexAtY.
    const rowList = Array.from(rows);
    const index = pickRowIndexAtY(
      rowList.map(row => row.getBoundingClientRect()),
      y
    );
    const row = rowList[index];
    return row ? resolve(row) : undefined;
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

  constructor(private readonly logic: ListViewUILogic) {}

  get host() {
    return this.logic.ui$.value;
  }

  hostConnected() {
    this.host?.disposables.add(
      this.logic.handleEvent('dragStart', context => {
        // Re-checked on every drag attempt, not just once at mount — matches
        // table's own `TableDragController.hostConnected` guard exactly.
        // Gating registration of the listener itself here instead would mean
        // a view that's readonly at mount time and later becomes writable
        // (without a full disconnect/reconnect) never gets drag working at
        // all, since the listener would never have been registered.
        if (this.logic.view.readonly$.value) {
          return false;
        }
        const event = context.get('pointerState').raw;
        const target = event.target;
        if (
          target instanceof Element &&
          this.host?.contains(target) &&
          target.closest('.affine-data-view-list-drag-handle')
        ) {
          event.preventDefault();
          const row = target.closest(
            '.affine-data-view-list-row'
          ) as HTMLElement | null;
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

const createDragPreview = (row: HTMLElement, x: number, y: number) => {
  const div = document.createElement('div');
  // Deliberately NOT a `row.cloneNode(true)` — unlike table's own
  // `TableRowView` (a real component re-instantiated with its props
  // reassigned), list rows embed live custom-element cell renderers (e.g.
  // the title cell) that read their data from JS properties, not
  // attributes. `cloneNode` only copies DOM/attributes, so a cloned cell
  // renderer's `connectedCallback` re-runs against `undefined` property
  // state and throws. A plain text ghost is enough for drag-preview
  // purposes (visual feedback only, not interactive).
  const ghost = document.createElement('div');
  ghost.textContent =
    row.querySelector('.affine-data-view-list-title')?.textContent ?? '';
  ghost.style.padding = '1px 8px';
  ghost.style.whiteSpace = 'nowrap';
  ghost.style.overflow = 'hidden';
  ghost.style.textOverflow = 'ellipsis';
  div.append(ghost);
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
