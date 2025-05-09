import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import type {
  DragLocationHistory,
  DropTargetRecord,
  ElementDragType,
  ExternalDragType,
} from '@atlaskit/pragmatic-drag-and-drop/types';
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import {
  attachInstruction,
  extractInstruction,
  type Instruction,
  type ItemMode,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { shallowUpdater } from '../../utils';
import { getAdaptedEventArgs, isExternalDrag } from './common';
import { DNDContext } from './context';
import type { DNDData, fromExternalData } from './types';

export type DropTargetDropEvent<D extends DNDData> = {
  treeInstruction: Instruction | null;
  closestEdge: Edge | null;
  /**
   * Location history for the drag operation
   */
  location: DragLocationHistory;
  /**
   * Data associated with the entity that is being dragged
   */
  source: Exclude<ElementDragType['payload'], 'data'> & {
    data: D['draggable'];
  };
  self: DropTargetRecord;
};

export type DropTargetDragEvent<D extends DNDData> = DropTargetDropEvent<D>;

export type DropTargetTreeInstruction = Instruction;

export type ExternalDragPayload = ExternalDragType['payload'];

export type DropTargetGetFeedback<D extends DNDData> = Parameters<
  NonNullable<Parameters<typeof dropTargetForElements>[0]['canDrop']>
>[0] & {
  source: {
    data: D['draggable'];
  };
} & {
  treeInstruction: Instruction | null;
  closestEdge: Edge | null;
};

type DropTargetGet<T, D extends DNDData> =
  | T
  | ((data: DropTargetGetFeedback<D>) => T);

function dropTargetGet<T, D extends DNDData>(
  get: T,
  options: DropTargetOptions<D>
): T extends undefined
  ? undefined
  : T extends DropTargetGet<infer I, D>
    ? (
        args: Omit<DropTargetGetFeedback<D>, 'treeInstruction' | 'closestEdge'>
      ) => I
    : never {
  if (get === undefined) {
    return undefined as any;
  }

  return ((
    args: Omit<DropTargetGetFeedback<D>, 'treeInstruction' | 'closestEdge'>
  ) => {
    if (typeof get === 'function') {
      return (get as any)({
        ...getAdaptedEventArgs(args, options.fromExternalData),
        get treeInstruction() {
          return options.treeInstruction
            ? extractInstruction(
                attachInstruction(
                  {},
                  {
                    input: args.input,
                    element: args.element,
                    currentLevel: options.treeInstruction.currentLevel,
                    indentPerLevel: options.treeInstruction.indentPerLevel,
                    mode: options.treeInstruction.mode,
                    block: options.treeInstruction.block,
                  }
                )
              )
            : null;
        },
        get closestEdge() {
          return options.closestEdge
            ? extractClosestEdge(
                attachClosestEdge(
                  {},
                  {
                    input: args.input,
                    element: args.element,
                    allowedEdges: options.closestEdge.allowedEdges,
                  }
                )
              )
            : null;
        },
      });
    } else {
      return {
        ...getAdaptedEventArgs(args, options.fromExternalData),
        ...get,
      };
    }
  }) as any;
}

export interface DropTargetOptions<D extends DNDData = DNDData> {
  data?: DropTargetGet<D['dropTarget'], D>;
  canDrop?: DropTargetGet<boolean, D>;
  dropEffect?: DropTargetGet<'copy' | 'link' | 'move', D>;
  isSticky?: DropTargetGet<boolean, D>;
  treeInstruction?: {
    block?: Instruction['type'][];
    mode: ItemMode;
    currentLevel: number;
    indentPerLevel: number;
  };
  closestEdge?: {
    allowedEdges: Edge[];
  };
  onDrop?: (data: DropTargetDropEvent<D>) => void;
  onDrag?: (data: DropTargetDragEvent<D>) => void;
  onDragEnter?: (data: DropTargetDragEvent<D>) => void;
  onDragLeave?: (data: DropTargetDragEvent<D>) => void;
  /**
   * external data adapter.
   * Will use the external data adapter from the context if not provided.
   */
  fromExternalData?: fromExternalData<D>;
  /**
   * Make the drop target allow external data.
   * If this is undefined, it will be set to true if fromExternalData is provided.
   *
   * @default undefined
   */
  allowExternal?: boolean;
}

export const useDropTarget = <D extends DNDData = DNDData>(
  getOptions: () => DropTargetOptions<D> = () => ({}),
  deps: any[] = []
) => {
  const dropTargetRef = useRef<any>(null);
  const [draggedOver, setDraggedOver] = useState<boolean>(false);
  const [treeInstruction, setTreeInstruction] = useState<Instruction | null>(
    null
  );
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [dropEffect, setDropEffect] = useState<'copy' | 'link' | 'move' | null>(
    null
  );
  const [draggedOverDraggable, setDraggedOverDraggable] = useState<
    DropTargetDropEvent<D>['source'] | null
  >(null);
  const [draggedOverPosition, setDraggedOverPosition] = useState<{
    /**
     * relative position to the drop target element top-left corner
     */
    relativeX: number;
    relativeY: number;
    clientX: number;
    clientY: number;
  }>({ relativeX: 0, relativeY: 0, clientX: 0, clientY: 0 });

  const enableDraggedOver = useRef(false);
  const enableDraggedOverDraggable = useRef(false);
  const enableDraggedOverPosition = useRef(false);
  const enableDropEffect = useRef(false);

  const dropTargetContext = useContext(DNDContext);

  const options = useMemo(() => {
    const opts = getOptions();
    const allowExternal = opts.allowExternal ?? !!opts.fromExternalData;
    return {
      ...opts,
      allowExternal,
      fromExternalData: allowExternal
        ? (opts.fromExternalData ??
          (dropTargetContext.fromExternalData as fromExternalData<D>))
        : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, dropTargetContext.fromExternalData]);

  const getDropTargetOptions = useCallback(() => {
    const wrappedCanDrop = dropTargetGet(options.canDrop, options);
    let element: HTMLElement | null = dropTargetRef.current;

    if (
      !element ||
      (typeof options.canDrop === 'boolean' && !options.canDrop)
    ) {
      return null;
    }

    const updateDragOver = (
      args: DropTargetDragEvent<D>,
      handler?: (data: DropTargetDragEvent<D>) => void
    ) => {
      args = getAdaptedEventArgs(args, options.fromExternalData);
      if (
        args.location.current.dropTargets[0]?.element === dropTargetRef.current
      ) {
        if (enableDraggedOverDraggable.current) {
          setDraggedOverDraggable(shallowUpdater(args.source));
        }
        let instruction = null;
        let closestEdge = null;
        if (options.treeInstruction) {
          instruction = extractInstruction(args.self.data);
          setTreeInstruction(shallowUpdater(instruction));
          if (dropTargetRef.current) {
            dropTargetRef.current.dataset['treeInstruction'] =
              instruction?.type;
          }
        }
        if (options.closestEdge) {
          closestEdge = extractClosestEdge(args.self.data);
          setClosestEdge(shallowUpdater(closestEdge));
        }
        if (enableDropEffect.current) {
          setDropEffect(shallowUpdater(args.self.dropEffect));
        }
        if (enableDraggedOverPosition.current) {
          const rect = args.self.element.getBoundingClientRect();
          const { clientX, clientY } = args.location.current.input;
          setDraggedOverPosition(
            shallowUpdater({
              relativeX: clientX - rect.x,
              relativeY: clientY - rect.y,
              clientX: clientX,
              clientY: clientY,
            })
          );
        }
        handler?.({
          ...args,
          treeInstruction: instruction,
          closestEdge,
        } as DropTargetDropEvent<D>);
      }
    };

    return {
      element,
      canDrop: wrappedCanDrop
        ? (args: DropTargetGetFeedback<D>) => {
            // check if args has data. if not, it's an external drag
            // we always allow external drag since the data is only
            // available in drop event
            if (isExternalDrag(args) && options.fromExternalData) {
              return true;
            }
            return wrappedCanDrop(args);
          }
        : undefined,
      getDropEffect: dropTargetGet(options.dropEffect, options),
      getIsSticky: dropTargetGet(options.isSticky, options),
      onDrop: (_args: DropTargetDropEvent<D>) => {
        if (enableDraggedOver.current) {
          setDraggedOver(false);
        }
        if (enableDraggedOverDraggable.current) {
          setDraggedOverDraggable(null);
        }
        if (enableDraggedOverPosition.current) {
          setDraggedOverPosition({
            relativeX: 0,
            relativeY: 0,
            clientX: 0,
            clientY: 0,
          });
        }
        if (options.treeInstruction) {
          setTreeInstruction(null);
          if (element) {
            delete element.dataset['treeInstruction'];
          }
        }
        if (options.closestEdge) {
          setClosestEdge(null);
        }
        if (enableDropEffect.current) {
          setDropEffect(null);
        }
        if (element) {
          delete element.dataset['draggedOver'];
        }

        // external data is only available in drop event thus
        // this is the only case for getAdaptedEventArgs
        const args = {
          ...getAdaptedEventArgs(_args, options.fromExternalData, true),
          treeInstruction: extractInstruction(_args.self.data),
          closestEdge: extractClosestEdge(_args.self.data),
        };
        if (
          isExternalDrag(_args) &&
          options.fromExternalData &&
          typeof options.canDrop === 'function' &&
          // there is a small flaw that canDrop called in onDrop misses
          // `input and `element` arguments
          !options.canDrop(args as any)
        ) {
          return;
        }

        if (args.location.current.dropTargets[0]?.element === element) {
          options.onDrop?.(args as DropTargetDropEvent<D>);
        }
      },
      getData: (args: DropTargetGetFeedback<D>) => {
        args = getAdaptedEventArgs(args, options.fromExternalData);
        const originData = dropTargetGet(options.data ?? {}, options)(args);
        const { input, element } = args;
        const withInstruction = options.treeInstruction
          ? attachInstruction(originData, {
              input,
              element,
              currentLevel: options.treeInstruction.currentLevel,
              indentPerLevel: options.treeInstruction.indentPerLevel,
              mode: options.treeInstruction.mode,
              block: options.treeInstruction.block,
            })
          : originData;
        const withClosestEdge = options.closestEdge
          ? attachClosestEdge(withInstruction, {
              element,
              input,
              allowedEdges: options.closestEdge.allowedEdges,
            })
          : withInstruction;
        return withClosestEdge;
      },
      onDrag: (args: DropTargetDragEvent<D>) => {
        updateDragOver(args, options.onDrag);
      },
      onDragEnter: (args: DropTargetDragEvent<D>) => {
        updateDragOver(args, options.onDragEnter);
      },
      onDragLeave: (args: DropTargetDragEvent<D>) => {
        args = getAdaptedEventArgs(args, options.fromExternalData);

        const withClosestEdge = options.closestEdge
          ? attachClosestEdge(args.self.data, {
              element: args.self.element,
              input: args.location.current.input,
              allowedEdges: options.closestEdge.allowedEdges,
            })
          : args.self.data;

        options.onDragLeave?.({
          ...args,
          self: { ...args.self, data: withClosestEdge },
        });
      },
      onDropTargetChange: (args: DropTargetDropEvent<D>) => {
        args = getAdaptedEventArgs(args, options.fromExternalData);
        if (args.location.current.dropTargets[0]?.element === element) {
          if (enableDraggedOver.current) {
            setDraggedOver(true);
          }
          if (options.treeInstruction) {
            const instruction = extractInstruction(args.self.data);
            setTreeInstruction(instruction);
            if (element) {
              element.dataset['treeInstruction'] = instruction?.type;
            }
          }
          if (options.closestEdge) {
            const closestEdge = extractClosestEdge(args.self.data);
            setClosestEdge(closestEdge);
          }
          if (enableDropEffect.current) {
            setDropEffect(args.self.dropEffect);
          }
          if (enableDraggedOverDraggable.current) {
            setDraggedOverDraggable(args.source);
          }
          if (enableDraggedOverPosition.current) {
            const rect = args.self.element.getBoundingClientRect();
            setDraggedOverPosition({
              relativeX: args.location.current.input.clientX - rect.x,
              relativeY: args.location.current.input.clientY - rect.y,
              clientX: args.location.current.input.clientX,
              clientY: args.location.current.input.clientY,
            });
          }
          if (element) {
            element.dataset['draggedOver'] = 'true';
          }
        } else {
          if (enableDraggedOver.current) {
            setDraggedOver(false);
          }
          if (enableDraggedOverDraggable.current) {
            setDraggedOverDraggable(null);
          }
          if (options.treeInstruction) {
            setTreeInstruction(null);
            if (element) {
              delete element.dataset['treeInstruction'];
            }
          }
          if (enableDropEffect.current) {
            setDropEffect(args.self.dropEffect);
          }
          if (enableDraggedOverPosition.current) {
            setDraggedOverPosition({
              relativeX: 0,
              relativeY: 0,
              clientX: 0,
              clientY: 0,
            });
          }
          if (options.closestEdge) {
            setClosestEdge(null);
          }
          if (element) {
            delete element.dataset['draggedOver'];
          }
        }
      },
    };
  }, [options]);

  useEffect(() => {
    const dropTargetOptions = getDropTargetOptions();
    if (!dropTargetOptions) {
      return;
    }

    // @ts-expect-error: fix type error
    const cleanup = [dropTargetForElements(dropTargetOptions)];

    if (options.allowExternal && options.fromExternalData) {
      // @ts-expect-error: fix type error
      cleanup.push(dropTargetForExternal(dropTargetOptions));
    }

    return combine(...cleanup);
  }, [
    getDropTargetOptions,
    options.canDrop,
    options.allowExternal,
    options.fromExternalData,
  ]);

  return {
    dropTargetRef,
    get draggedOver() {
      enableDraggedOver.current = true;
      return draggedOver;
    },
    get draggedOverDraggable() {
      enableDraggedOverDraggable.current = true;
      return draggedOverDraggable;
    },
    get draggedOverPosition() {
      enableDraggedOverPosition.current = true;
      return draggedOverPosition;
    },
    get dropEffect() {
      enableDropEffect.current = true;
      return dropEffect;
    },
    treeInstruction,
    closestEdge,
  };
};
