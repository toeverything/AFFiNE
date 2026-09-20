import type { DndController } from '@blocksuite/std';

import type { CalendarEntry, CalendarRowEntry } from '../types.js';
import { getCalendarDateFromPoint } from './hit-test.js';

export type CalendarDndEntity =
  | {
      type: 'calendar-entry';
      entryId: string;
    }
  | {
      type: 'doc';
      docId: string;
    };

type CalendarDndData = {
  bsEntity?: unknown;
  entity?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const getCalendarDndEntity = (
  data: unknown
): CalendarDndEntity | undefined => {
  if (!isRecord(data)) {
    return;
  }

  const bsEntity = (data as CalendarDndData).bsEntity;
  if (isRecord(bsEntity)) {
    if (
      bsEntity.type === 'calendar-entry' &&
      typeof bsEntity.entryId === 'string'
    ) {
      return {
        type: 'calendar-entry',
        entryId: bsEntity.entryId,
      };
    }
    if (bsEntity.type === 'doc' && typeof bsEntity.docId === 'string') {
      return {
        type: 'doc',
        docId: bsEntity.docId,
      };
    }
  }

  const entity = (data as CalendarDndData).entity;
  if (
    isRecord(entity) &&
    entity.type === 'doc' &&
    typeof entity.id === 'string'
  ) {
    return {
      type: 'doc',
      docId: entity.id,
    };
  }

  return;
};

export type CalendarDndCallbacks = {
  getEntry: (entryId: string) => CalendarEntry | undefined;
  canDragEntry: () => boolean;
  canDrop: (entity: CalendarDndEntity) => boolean;
  onEntryDragStart: (entry: CalendarRowEntry) => void;
  onEntryDragEnd: () => void;
  onDropTargetChange: (
    date: number | undefined,
    entity?: CalendarDndEntity
  ) => void;
  onDrop: (entity: CalendarDndEntity, date: number) => void;
};

type ElementCleanup = {
  element: HTMLElement;
  cleanup: () => void;
};

export class CalendarDnd {
  private readonly entryCleanups = new Map<string, ElementCleanup>();

  private rootCleanup?: ElementCleanup;

  constructor(
    private readonly dnd: DndController | undefined,
    private readonly callbacks: CalendarDndCallbacks
  ) {}

  bindRoot(element?: Element) {
    if (!this.dnd || !(element instanceof HTMLElement)) {
      this.cleanupRoot();
      return;
    }

    if (this.rootCleanup?.element === element) {
      return;
    }
    this.cleanupRoot();

    const cleanup = this.dnd.dropTarget<CalendarDndEntity, { date?: number }>({
      element,
      getIsSticky: () => true,
      setDropData: ({ input }) => ({
        date: getCalendarDateFromPoint(element, input.clientX, input.clientY),
      }),
      canDrop: ({ source, input }) => {
        const entity = getCalendarDndEntity(source.data);
        const date = getCalendarDateFromPoint(
          element,
          input.clientX,
          input.clientY
        );
        return entity && date !== undefined
          ? this.callbacks.canDrop(entity)
          : false;
      },
      onDrag: ({ source, location }) => {
        this.updateDropTarget(element, source.data, location.current.input);
      },
      onDragEnter: ({ source, location }) => {
        this.updateDropTarget(element, source.data, location.current.input);
      },
      onDragLeave: () => {
        this.callbacks.onDropTargetChange(undefined);
      },
      onDrop: ({ source, location }) => {
        const entity = getCalendarDndEntity(source.data);
        const date = getCalendarDateFromPoint(
          element,
          location.current.input.clientX,
          location.current.input.clientY
        );
        if (entity && date !== undefined && this.callbacks.canDrop(entity)) {
          this.callbacks.onDrop(entity, date);
        }
        this.callbacks.onDropTargetChange(undefined);
      },
    });

    this.rootCleanup = { element, cleanup };
  }

  bindEntry(
    key: string,
    entry: CalendarEntry,
    element?: Element,
    disabled = false
  ) {
    if (
      !this.dnd ||
      !(element instanceof HTMLElement) ||
      entry.kind !== 'row' ||
      disabled
    ) {
      this.cleanupEntry(key);
      if (element instanceof HTMLElement) {
        element.setAttribute('draggable', 'false');
      }
      return;
    }

    const current = this.entryCleanups.get(key);
    if (current?.element === element) {
      return;
    }
    this.cleanupEntry(key);

    const cleanup = this.dnd.draggable<CalendarDndEntity>({
      element,
      canDrag: () => {
        const currentEntry = this.callbacks.getEntry(entry.id);
        return currentEntry?.kind === 'row'
          ? this.callbacks.canDragEntry()
          : false;
      },
      setDragData: () => ({
        type: 'calendar-entry',
        entryId: entry.id,
      }),
      setDragPreview: ({ container, setOffset }) => {
        const currentEntry = this.callbacks.getEntry(entry.id);
        const preview = document.createElement('div');
        preview.textContent = currentEntry?.title || 'Untitled';
        preview.style.cssText =
          'padding:0 6px;height:22px;line-height:22px;border-radius:4px;' +
          'font-size:12px;white-space:nowrap;overflow:hidden;' +
          'background:var(--affine-hover-color,#f5f5f5);' +
          'color:var(--affine-text-primary-color,#333);' +
          'max-width:140px;text-overflow:ellipsis;pointer-events:none;';
        container.append(preview);
        setOffset({ x: 10, y: 11 });
      },
      onDragStart: () => {
        const currentEntry = this.callbacks.getEntry(entry.id);
        if (currentEntry?.kind === 'row') {
          this.callbacks.onEntryDragStart(currentEntry);
        }
      },
      onDrop: () => {
        this.callbacks.onEntryDragEnd();
      },
    });

    this.entryCleanups.set(key, { element, cleanup });
  }

  cleanup() {
    this.cleanupRoot();
    for (const key of this.entryCleanups.keys()) {
      this.cleanupEntry(key);
    }
  }

  private cleanupEntry(key: string) {
    this.entryCleanups.get(key)?.cleanup();
    this.entryCleanups.delete(key);
  }

  private cleanupRoot() {
    this.rootCleanup?.cleanup();
    this.rootCleanup = undefined;
  }

  private updateDropTarget(
    root: HTMLElement,
    data: unknown,
    input: {
      clientX: number;
      clientY: number;
    }
  ) {
    const entity = getCalendarDndEntity(data);
    const date = getCalendarDateFromPoint(root, input.clientX, input.clientY);
    if (entity && date !== undefined && this.callbacks.canDrop(entity)) {
      this.callbacks.onDropTargetChange(date, entity);
    } else {
      this.callbacks.onDropTargetChange(undefined);
    }
  }
}
