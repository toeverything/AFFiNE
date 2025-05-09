import {
  draggable,
  dropTargetForElements,
  type ElementGetFeedbackArgs,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { centerUnderPointer } from '@atlaskit/pragmatic-drag-and-drop/element/center-under-pointer';
import { disableNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { preserveOffsetOnSource } from '@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import type { DropTargetRecord } from '@atlaskit/pragmatic-drag-and-drop/types';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { ServiceIdentifier } from '@blocksuite/global/di';

import { LifeCycleWatcherIdentifier } from '../../identifier.js';
import { LifeCycleWatcher } from '../lifecycle-watcher.js';
import type {
  ElementDragEventBaseArgs,
  ElementDragEventMap,
  ElementDropEventMap,
  ElementDropTargetFeedbackArgs,
  ElementMonitorFeedbackArgs,
  OriginalAutoScrollOption,
  OriginalDraggableOption,
  OriginalDropTargetOption,
  OriginalMonitorOption,
} from './types.js';

export type DragEntity = { type: string };

export type DragFrom = { at: string };

export type DragFromBlockSuite = {
  at: 'blocksuite-editor';
  docId: string;
};

export type DragPayload<
  E extends DragEntity = DragEntity,
  F extends DragFrom = DragFromBlockSuite,
> = {
  bsEntity?: E;
  from?: F;
};

export type DropPayload<T extends {} = {}> = {
  edge?: Edge;
} & T;

export type DropEdge = Edge;

export interface DNDEntity {
  basic: DragEntity;
}

export type DraggableOption<
  PayloadEntity extends DragEntity,
  PayloadFrom extends DragFrom,
  DropPayload extends {},
> = Pick<OriginalDraggableOption, 'element' | 'dragHandle' | 'canDrag'> & {
  /**
   * Set drag data for the draggable element.
   * @see {@link ElementGetFeedbackArgs} for callback arguments
   * @param callback - callback to set drag
   */
  setDragData?: (args: ElementGetFeedbackArgs) => PayloadEntity;

  /**
   * Set external drag data for the draggable element.
   * @param callback - callback to set external drag data
   * @see {@link ElementGetFeedbackArgs} for callback arguments
   */
  setExternalDragData?: (
    args: ElementGetFeedbackArgs
  ) => ReturnType<
    Required<OriginalDraggableOption>['getInitialDataForExternal']
  >;

  /**
   * Set custom drag preview for the draggable element.
   *
   * `setDragPreview` is a function that will be called with a `container` element and other drag data as parameter when the drag preview is generating.
   * Append the custom element to the `container` which will be used to generate the preview. Once the drag preview is generated, the
   * `container` element and its children will be removed automatically.
   *
   * If you want to completely disable the drag preview, just set `setDragPreview` to `false`.
   *
   * @example
   * dnd.draggable({
   *  // ...
   *  setDragPreview: ({ container }) => {
   *    const preview = document.createElement('div');
   *    preview.style.width = '100px';
   *    preview.style.height = '100px';
   *    preview.style.backgroundColor = 'red';
   *    preview.innerText = 'Custom Drag Preview';
   *    container.appendChild(preview);
   *
   *    return () => {
   *      // do some cleanup
   *    }
   *  }
   * })
   *
   * @param callback - callback to set custom drag preview
   * @returns
   */
  setDragPreview?:
    | false
    | ((
        options: ElementDragEventBaseArgs<
          DragPayload<PayloadEntity, PayloadFrom>
        > & {
          /**
           * Allows you to use the native `setDragImage` function if you want
           * Although, we recommend using alternative techniques (see element adapter docs)
           */
          nativeSetDragImage: DataTransfer['setDragImage'] | null;
          container: HTMLElement;
          setOffset: (
            offset: 'preserve' | 'center' | { x: number; y: number }
          ) => void;
        }
      ) => void | (() => void));
} & ElementDragEventMap<DragPayload<PayloadEntity, PayloadFrom>, DropPayload>;

export type DropTargetOption<
  PayloadEntity extends DragEntity,
  PayloadFrom extends DragFrom,
  DropPayload extends {},
> = {
  /**
   * {@link OriginalDropTargetOption.element}
   */
  element: HTMLElement;

  /**
   * Allow drop position for the drop target.
   */
  allowDropPosition?: Edge[];

  /**
   * {@link OriginalDropTargetOption.getDropEffect}
   */
  getDropEffect?: (
    args: ElementDropTargetFeedbackArgs<DragPayload<PayloadEntity, PayloadFrom>>
  ) => DropTargetRecord['dropEffect'];

  /**
   * {@link OriginalDropTargetOption.canDrop}
   */
  canDrop?: (
    args: ElementDropTargetFeedbackArgs<DragPayload<PayloadEntity, PayloadFrom>>
  ) => boolean;

  /**
   * {@link OriginalDropTargetOption.getData}
   */
  setDropData?: (
    args: ElementDropTargetFeedbackArgs<DragPayload<PayloadEntity, PayloadFrom>>
  ) => DropPayload;

  /**
   * {@link OriginalDropTargetOption.getIsSticky}
   */
  getIsSticky?: (
    args: ElementDropTargetFeedbackArgs<DragPayload<PayloadEntity, PayloadFrom>>
  ) => boolean;
} & ElementDropEventMap<DragPayload<PayloadEntity, PayloadFrom>, DropPayload>;

export type MonitorOption<
  PayloadEntity extends DragEntity,
  PayloadFrom extends DragFrom,
  DropPayload extends {},
> = {
  /**
   * {@link OriginalMonitorOption.canMonitor}
   */
  canMonitor?: (
    args: ElementMonitorFeedbackArgs<DragPayload<PayloadEntity, PayloadFrom>>
  ) => boolean;
} & ElementDragEventMap<DragPayload<PayloadEntity, PayloadFrom>, DropPayload>;

export type AutoScroll<
  PayloadEntity extends DragEntity,
  PayloadFrom extends DragFrom,
> = {
  element: HTMLElement;
  canScroll?: (
    args: ElementDragEventBaseArgs<DragPayload<PayloadEntity, PayloadFrom>>
  ) => void;
  getAllowedAxis?: (
    args: ElementDragEventBaseArgs<DragPayload<PayloadEntity, PayloadFrom>>
  ) => ReturnType<Required<OriginalAutoScrollOption>['getAllowedAxis']>;
  getConfiguration?: (
    args: ElementDragEventBaseArgs<DragPayload<PayloadEntity, PayloadFrom>>
  ) => ReturnType<Required<OriginalAutoScrollOption>['getConfiguration']>;
};

export const DndExtensionIdentifier = LifeCycleWatcherIdentifier(
  'DndController'
) as ServiceIdentifier<DndController>;

export class DndController extends LifeCycleWatcher {
  static override key = 'DndController';

  /**
   * Make an element draggable.
   */
  draggable<
    PayloadEntity extends DragEntity = DragEntity,
    DropData extends {} = {},
  >(
    args: DraggableOption<
      PayloadEntity,
      DragFromBlockSuite,
      DropPayload<DropData>
    >
  ) {
    const {
      setDragData,
      setExternalDragData,
      setDragPreview,
      element,
      dragHandle,
      ...rest
    } = args;

    return draggable({
      ...(rest as Partial<OriginalDraggableOption>),
      element,
      dragHandle,
      onGenerateDragPreview: options => {
        if (setDragPreview) {
          let state: typeof centerUnderPointer | { x: number; y: number };

          const setOffset = (
            offset: 'preserve' | 'center' | { x: number; y: number }
          ) => {
            if (offset === 'center') {
              state = centerUnderPointer;
            } else if (offset === 'preserve') {
              state = preserveOffsetOnSource({
                element: options.source.element,
                input: options.location.current.input,
              });
            } else if (typeof offset === 'object') {
              if (
                offset.x < 0 ||
                offset.y < 0 ||
                typeof offset.x === 'string' ||
                typeof offset.y === 'string'
              ) {
                state = pointerOutsideOfPreview({
                  x:
                    typeof offset.x === 'number'
                      ? `${Math.abs(offset.x)}px`
                      : offset.x,
                  y:
                    typeof offset.y === 'number'
                      ? `${Math.abs(offset.y)}px`
                      : offset.y,
                });
              }
              state = offset;
            }
          };

          setCustomNativeDragPreview({
            getOffset: (...args) => {
              if (!state) {
                setOffset('center');
              }

              if (typeof state === 'function') {
                return state(...args);
              }

              return state;
            },
            render: renderOption => {
              setDragPreview({
                setOffset,
                ...options,
                ...renderOption,
              });
            },
            nativeSetDragImage: options.nativeSetDragImage,
          });
        } else if (setDragPreview === false) {
          disableNativeDragPreview({
            nativeSetDragImage: options.nativeSetDragImage,
          });
        }
      },
      getInitialData: options => {
        const bsEntity = setDragData?.(options) ?? {};

        return {
          bsEntity,
          from: {
            at: 'blocksuite-editor',
            docId: this.std.store.doc.id,
          },
        };
      },
      getInitialDataForExternal: setExternalDragData
        ? options => {
            return setExternalDragData?.(options);
          }
        : undefined,
    });
  }

  /**
   * Make an element a drop target.
   */
  dropTarget<
    PayloadEntity extends DragEntity = DragEntity,
    DropData extends {} = {},
    PayloadFrom extends DragFrom = DragFromBlockSuite,
  >(args: DropTargetOption<PayloadEntity, PayloadFrom, DropPayload<DropData>>) {
    const {
      element,
      setDropData,
      allowDropPosition = ['bottom', 'left', 'top', 'right'],
      ...rest
    } = args;

    return dropTargetForElements({
      element,
      getData: options => {
        const data = setDropData?.(options) ?? {};
        const edge = extractClosestEdge(
          attachClosestEdge(data, {
            element: options.element,
            input: options.input,
            allowedEdges: allowDropPosition,
          })
        );

        return edge
          ? {
              ...data,
              edge,
            }
          : data;
      },
      ...(rest as Partial<OriginalDropTargetOption>),
    });
  }

  monitor<
    PayloadEntity extends DragEntity = DragEntity,
    DropData extends {} = {},
    PayloadFrom extends DragFrom = DragFromBlockSuite,
  >(args: MonitorOption<PayloadEntity, PayloadFrom, DropPayload<DropData>>) {
    return monitorForElements(args as OriginalMonitorOption);
  }

  autoScroll<
    PayloadEntity extends DragEntity = DragEntity,
    PayloadFrom extends DragFrom = DragFromBlockSuite,
  >(options: AutoScroll<PayloadEntity, PayloadFrom>) {
    return autoScrollForElements(options as OriginalAutoScrollOption);
  }
}
