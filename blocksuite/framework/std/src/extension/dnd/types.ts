import type {
  draggable,
  dropTargetForElements,
  ElementDropTargetGetFeedbackArgs,
  ElementMonitorGetFeedbackArgs,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type {
  DragLocation,
  // oxlint-disable-next-line no-unused-vars
  DragLocationHistory,
  DropTargetRecord,
  ElementDragType,
} from '@atlaskit/pragmatic-drag-and-drop/types';
import type { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';

export type ElementDragEventBaseArgs<Payload, DropPayload = {}> = {
  /**
   * {@link DragLocationHistory} of the drag
   */
  location: {
    /**
     * {@link DragLocationHistory.initial}
     */
    initial: DragLocationWithPayload<DropPayload>;
    /**
     * {@link DragLocationHistory.current}
     */
    current: DragLocationWithPayload<DropPayload>;
    /**
     * {@link DragLocationHistory.previous}
     */
    previous: Pick<DragLocationWithPayload<DropPayload>, 'dropTargets'>;
  };
  source: Omit<ElementDragType['payload'], 'data'> & { data: Payload };
};

export type DragLocationWithPayload<Payload> = Omit<
  DragLocation,
  'dropTargets'
> & {
  dropTargets: DropTargetRecordWithPayload<Payload>[];
};

export type DropTargetRecordWithPayload<Payload> = Omit<
  DropTargetRecord,
  'data'
> & {
  data: Payload;
};

export type ElementDragEventMap<DragPayload, DropPayload> = {
  onDragStart?: (
    data: ElementDragEventBaseArgs<DragPayload, DropPayload>
  ) => void;
  onDrag?: (data: ElementDragEventBaseArgs<DragPayload, DropPayload>) => void;
  onDrop?: (data: ElementDragEventBaseArgs<DragPayload, DropPayload>) => void;
  onDropTargetChange?: (
    data: ElementDragEventBaseArgs<DragPayload, DropPayload>
  ) => void;
};

type DropTargetLocalizedData = {
  self: DropTargetRecord;
};

export type ElementDropTargetFeedbackArgs<Payload> = Omit<
  ElementDropTargetGetFeedbackArgs,
  'source'
> & {
  source: Omit<ElementDragType['payload'], 'data'> & { data: Payload };
};

export type ElementDropEventMap<DragPayload, DropPayload> = {
  onDragStart?: (
    data: ElementDragEventBaseArgs<DragPayload, DropPayload> &
      DropTargetLocalizedData
  ) => void;
  onDrag?: (
    data: ElementDragEventBaseArgs<DragPayload, DropPayload> &
      DropTargetLocalizedData
  ) => void;
  onDrop?: (
    data: ElementDragEventBaseArgs<DragPayload, DropPayload> &
      DropTargetLocalizedData
  ) => void;
  onDropTargetChange?: (
    data: ElementDragEventBaseArgs<DragPayload, DropPayload> &
      DropTargetLocalizedData
  ) => void;
  onDragEnter?: (
    data: ElementDragEventBaseArgs<DragPayload, DropPayload> &
      DropTargetLocalizedData
  ) => void;
  onDragLeave?: (
    data: ElementDragEventBaseArgs<DragPayload, DropPayload> &
      DropTargetLocalizedData
  ) => void;
};

export type ElementMonitorFeedbackArgs<Payload> = Omit<
  ElementMonitorGetFeedbackArgs,
  'source'
> & {
  source: Omit<ElementDragType['payload'], 'data'> & { data: Payload };
};

export type OriginalDraggableOption = Parameters<typeof draggable>[0];

export type OriginalDropTargetOption = Parameters<
  typeof dropTargetForElements
>[0];

export type OriginalMonitorOption = Parameters<typeof monitorForElements>[0];

export type OriginalAutoScrollOption = Parameters<
  typeof autoScrollForElements
>[0];
