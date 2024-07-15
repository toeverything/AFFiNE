import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
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
import { useEffect, useMemo, useRef, useState } from 'react';

import type { DNDData } from './types';

type DropTargetGetFeedback<D extends DNDData> = Parameters<
  NonNullable<Parameters<typeof dropTargetForElements>[0]['canDrop']>
>[0] & {
  source: {
    data: D['draggable'];
  };
};

type DropTargetGet<T, D extends DNDData> =
  | T
  | ((data: DropTargetGetFeedback<D>) => T);

function dropTargetGet<T, D extends DNDData>(
  get: T
): T extends undefined
  ? undefined
  : T extends DropTargetGet<infer I, D>
    ? (args: DropTargetGetFeedback<D>) => I
    : never {
  if (get === undefined) {
    return undefined as any;
  }
  return ((args: DropTargetGetFeedback<D>) =>
    typeof get === 'function' ? (get as any)(args) : get) as any;
}

export type DropTargetDropEvent<D extends DNDData> = Parameters<
  NonNullable<Parameters<typeof dropTargetForElements>[0]['onDrop']>
>[0] & { treeInstruction: Instruction | null; closestEdge: Edge | null } & {
  source: { data: D['draggable'] };
};

export type DropTargetDragEvent<D extends DNDData> = Parameters<
  NonNullable<Parameters<typeof dropTargetForElements>[0]['onDrag']>
>[0] & { treeInstruction: Instruction | null; closestEdge: Edge | null } & {
  source: { data: D['draggable'] };
};

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

  const enableDraggedOver = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(getOptions, deps);

  useEffect(() => {
    if (!dropTargetRef.current) {
      return;
    }
    return dropTargetForElements({
      element: dropTargetRef.current,
      canDrop: dropTargetGet(options.canDrop),
      getDropEffect: dropTargetGet(options.dropEffect),
      getIsSticky: dropTargetGet(options.isSticky),
      onDrop: args => {
        if (enableDraggedOver.current) {
          setDraggedOver(false);
        }
        if (options.treeInstruction) {
          setTreeInstruction(null);
        }
        if (options.closestEdge) {
          setClosestEdge(null);
        }
        if (dropTargetRef.current) {
          delete dropTargetRef.current.dataset['draggedOver'];
        }
        if (
          args.location.current.dropTargets[0]?.element ===
          dropTargetRef.current
        ) {
          options.onDrop?.({
            ...args,
            treeInstruction: extractInstruction(args.self.data),
            closestEdge: extractClosestEdge(args.self.data),
          } as DropTargetDropEvent<D>);
        }
      },
      getData: args => {
        const originData = dropTargetGet(options.data ?? {})(args);
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
      onDragEnter: () => {
        if (enableDraggedOver.current) {
          setDraggedOver(true);
        }
        if (dropTargetRef.current) {
          dropTargetRef.current.dataset['draggedOver'] = 'true';
        }
      },
      onDrag: args => {
        let instruction = null;
        let closestEdge = null;
        if (options.treeInstruction) {
          instruction = extractInstruction(args.self.data);
          setTreeInstruction(instruction);
        }
        if (options.closestEdge) {
          closestEdge = extractClosestEdge(args.self.data);
          setClosestEdge(closestEdge);
        }
        options.onDrag?.({
          ...args,
          treeInstruction: instruction,
          closestEdge,
        } as DropTargetDropEvent<D>);
      },
      onDragLeave: () => {
        if (enableDraggedOver.current) {
          setDraggedOver(false);
        }
        if (options.treeInstruction) {
          setTreeInstruction(null);
        }
        if (options.closestEdge) {
          setClosestEdge(null);
        }
        if (dropTargetRef.current) {
          delete dropTargetRef.current.dataset['draggedOver'];
        }
      },
    });
  }, [options]);

  return {
    dropTargetRef,
    get draggedOver() {
      enableDraggedOver.current = true;
      return draggedOver;
    },
    treeInstruction,
    closestEdge,
  };
};
