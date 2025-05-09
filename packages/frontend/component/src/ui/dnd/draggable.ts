import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { centerUnderPointer } from '@atlaskit/pragmatic-drag-and-drop/element/center-under-pointer';
import { disableNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { preserveOffsetOnSource } from '@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import type {
  BaseEventPayload,
  DropTargetRecord,
  ElementDragType,
} from '@atlaskit/pragmatic-drag-and-drop/types';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM, { flushSync } from 'react-dom';

import { DNDContext } from './context';
import {
  type DNDData,
  type DraggableGet,
  draggableGet,
  type DraggableGetFeedback,
  type toExternalData,
} from './types';

export interface DraggableOptions<D extends DNDData = DNDData> {
  data?: DraggableGet<D['draggable']>;
  toExternalData?: toExternalData<D>;
  onDragStart?: (data: BaseEventPayload<ElementDragType>) => void;
  onDrag?: (data: BaseEventPayload<ElementDragType>) => void;
  onDrop?: (data: BaseEventPayload<ElementDragType>) => void;
  onDropTargetChange?: (data: BaseEventPayload<ElementDragType>) => void;
  canDrag?: DraggableGet<boolean>;
  disableDragPreview?: boolean;
  dragPreviewPosition?: DraggableDragPreviewPosition;
}

export type DraggableDragPreviewPosition =
  | 'pointer-outside'
  | 'pointer-center'
  | 'native';

export type DraggableCustomDragPreviewProps = React.PropsWithChildren<{
  position?: DraggableDragPreviewPosition;
}>;

export const useDraggable = <D extends DNDData = DNDData>(
  getOptions: () => DraggableOptions<D> = () => ({}),
  deps: any[] = []
) => {
  const [dragging, setDragging] = useState<boolean>(false);
  const [draggingPosition, setDraggingPosition] = useState<{
    offsetX: number;
    offsetY: number;
    clientX: number;
    clientY: number;
    outWindow: boolean;
  }>({ offsetX: 0, offsetY: 0, clientX: 0, clientY: 0, outWindow: false });
  const [dropTarget, setDropTarget] = useState<
    (DropTargetRecord & { data: D['dropTarget'] })[]
  >([]);
  const [customDragPreviewPortal, setCustomDragPreviewPortal] = useState<
    React.FC<DraggableCustomDragPreviewProps>
  >(() => () => null);

  const dragRef = useRef<any>(null);
  const dragHandleRef = useRef<any>(null);

  const enableCustomDragPreview = useRef(false);
  const enableDraggingPosition = useRef(false);
  const enableDropTarget = useRef(false);
  const enableDragging = useRef(false);

  const context = useContext(DNDContext);

  const options = useMemo(() => {
    const opts = getOptions();

    const toExternalData = opts.toExternalData ?? context.toExternalData;
    return {
      ...opts,
      toExternalData: toExternalData
        ? (args: DraggableGetFeedback) => {
            return (opts.toExternalData ?? toExternalData)(args, opts.data);
          }
        : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, context.toExternalData]);

  useEffect(() => {
    if (
      !dragRef.current ||
      (typeof options.canDrag === 'boolean' && !options.canDrag)
    ) {
      return;
    }

    const element = dragRef.current;
    const dragHandle = dragHandleRef.current;

    const windowEvent = {
      dragleave: () => {
        setDraggingPosition(state =>
          state.outWindow === true ? state : { ...state, outWindow: true }
        );
      },
      dragover: () => {
        setDraggingPosition(state =>
          state.outWindow === true ? { ...state, outWindow: false } : state
        );
      },
    };

    element.dataset.affineDraggable = 'true';

    const cleanupDraggable = draggable({
      element,
      dragHandle: dragHandle ?? undefined,
      canDrag: draggableGet(options.canDrag),
      getInitialData: draggableGet(options.data),
      getInitialDataForExternal: draggableGet(options.toExternalData),
      onDragStart: args => {
        if (enableDragging.current) {
          setDragging(true);
        }
        if (enableDraggingPosition.current) {
          document.body.addEventListener('dragleave', windowEvent.dragleave);
          document.body.addEventListener('dragover', windowEvent.dragover);
          setDraggingPosition({
            offsetX: 0,
            offsetY: 0,
            clientX: args.location.initial.input.clientX,
            clientY: args.location.initial.input.clientY,
            outWindow: false,
          });
        }
        if (enableDropTarget.current) {
          setDropTarget([]);
        }
        if (element) {
          element.dataset['dragging'] = 'true';
        }
        options.onDragStart?.(args);
      },
      onDrop: args => {
        if (enableDragging.current) {
          setDragging(false);
        }
        if (enableDraggingPosition.current) {
          document.body.removeEventListener('dragleave', windowEvent.dragleave);
          document.body.removeEventListener('dragover', windowEvent.dragover);
          setDraggingPosition({
            offsetX: 0,
            offsetY: 0,
            clientX: 0,
            clientY: 0,
            outWindow: false,
          });
        }
        if (enableDropTarget.current) {
          setDropTarget([]);
        }
        if (element) {
          delete element.dataset['dragging'];
        }
        options.onDrop?.(args);
      },
      onDrag: args => {
        if (enableDraggingPosition.current) {
          setDraggingPosition(prev => ({
            offsetX:
              args.location.current.input.clientX -
              args.location.initial.input.clientX,
            offsetY:
              args.location.current.input.clientY -
              args.location.initial.input.clientY,
            clientX: args.location.current.input.clientX,
            clientY: args.location.current.input.clientY,
            outWindow: prev.outWindow,
          }));
        }
        options.onDrag?.(args);
      },
      onDropTargetChange(args) {
        if (enableDropTarget.current) {
          setDropTarget(args.location.current.dropTargets);
        }
        options.onDropTargetChange?.(args);
      },
      onGenerateDragPreview({ nativeSetDragImage, source, location }) {
        if (options.disableDragPreview) {
          disableNativeDragPreview({ nativeSetDragImage });
          return;
        }

        let previewPosition: DraggableDragPreviewPosition =
          options.dragPreviewPosition ?? 'native';

        source.element.dataset['dragPreview'] = 'true';
        requestAnimationFrame(() => {
          delete source.element.dataset['dragPreview'];
        });

        if (enableCustomDragPreview.current) {
          setCustomNativeDragPreview({
            getOffset: (...args) => {
              if (previewPosition === 'pointer-center') {
                return centerUnderPointer(...args);
              } else if (previewPosition === 'pointer-outside') {
                return pointerOutsideOfPreview({
                  x: '8px',
                  y: '4px',
                })(...args);
              } else {
                return preserveOffsetOnSource({
                  element: source.element,
                  input: location.current.input,
                })(...args);
              }
            },
            render({ container }) {
              flushSync(() => {
                setCustomDragPreviewPortal(
                  () =>
                    ({
                      children,
                      position,
                    }: DraggableCustomDragPreviewProps) => {
                      previewPosition = position || previewPosition;
                      return ReactDOM.createPortal(children, container);
                    }
                );
              });
              return () => setCustomDragPreviewPortal(() => () => null);
            },
            nativeSetDragImage,
          });
        } else if (previewPosition !== 'native') {
          setCustomNativeDragPreview({
            getOffset: (...args) => {
              if (previewPosition === 'pointer-center') {
                return centerUnderPointer(...args);
              } else if (previewPosition === 'pointer-outside') {
                return pointerOutsideOfPreview({
                  x: '8px',
                  y: '4px',
                })(...args);
              } else {
                return preserveOffsetOnSource({
                  element: source.element,
                  input: location.current.input,
                })(...args);
              }
            },
            render({ container }) {
              container.append(source.element.cloneNode(true));
            },
            nativeSetDragImage,
          });
        }
      },
    });

    return () => {
      window.removeEventListener('dragleave', windowEvent.dragleave);
      window.removeEventListener('dragover', windowEvent.dragover);
      cleanupDraggable();
    };
  }, [options]);

  return {
    get dragging() {
      enableDragging.current = true;
      return dragging;
    },
    get draggingPosition() {
      enableDraggingPosition.current = true;
      return draggingPosition;
    },
    get CustomDragPreview() {
      enableCustomDragPreview.current = true;
      return customDragPreviewPortal;
    },
    get dropTarget() {
      enableDropTarget.current = true;
      return dropTarget;
    },
    dragRef,
    dragHandleRef,
  };
};
