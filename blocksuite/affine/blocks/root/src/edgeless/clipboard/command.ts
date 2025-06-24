import {
  type ClipboardConfigCreationContext,
  EdgelessClipboardConfigIdentifier,
  EdgelessCRUDIdentifier,
  SurfaceGroupLikeModel,
} from '@blocksuite/affine-block-surface';
import { Bound, type IVec, type SerializedXYWH } from '@blocksuite/global/gfx';
import { assertType } from '@blocksuite/global/utils';
import type { BlockStdScope, Command } from '@blocksuite/std';
import {
  type GfxBlockElementModel,
  type GfxCompatibleProps,
  GfxControllerIdentifier,
  type GfxModel,
  type GfxPrimitiveElementModel,
  type SerializedElement,
  SortOrder,
} from '@blocksuite/std/gfx';
import { type BlockSnapshot, BlockSnapshotSchema } from '@blocksuite/store';

import { createCanvasElement } from './canvas';
import {
  createNewPresentationIndexes,
  edgelessElementsBoundFromRawData,
} from './utils';

interface Input {
  elementsRawData: (SerializedElement | BlockSnapshot)[];
  pasteCenter?: IVec;
}

type CreatedElements = {
  canvasElements: GfxPrimitiveElementModel[];
  blockModels: GfxBlockElementModel[];
};

interface Output {
  createdElementsPromise: Promise<CreatedElements>;
}

export const createElementsFromClipboardDataCommand: Command<Input, Output> = (
  ctx,
  next
) => {
  const { std, elementsRawData } = ctx;
  let { pasteCenter } = ctx;

  const gfx = std.get(GfxControllerIdentifier);
  const toolManager = gfx.tool;

  const runner = async (): Promise<CreatedElements> => {
    let oldCommonBound, pasteX, pasteY;
    {
      const lastMousePos = toolManager.lastMousePos$.peek();
      pasteCenter = pasteCenter ?? [lastMousePos.x, lastMousePos.y];
      const [modelX, modelY] = pasteCenter;
      oldCommonBound = edgelessElementsBoundFromRawData(elementsRawData);

      pasteX = modelX - oldCommonBound.w / 2;
      pasteY = modelY - oldCommonBound.h / 2;
    }

    const getNewXYWH = (oldXYWH: SerializedXYWH) => {
      const oldBound = Bound.deserialize(oldXYWH);
      return new Bound(
        oldBound.x + pasteX - oldCommonBound.x,
        oldBound.y + pasteY - oldCommonBound.y,
        oldBound.w,
        oldBound.h
      ).serialize();
    };

    // create blocks and canvas elements

    const context: ClipboardConfigCreationContext = {
      oldToNewIdMap: new Map<string, string>(),
      originalIndexes: new Map<string, string>(),
      newPresentationIndexes: createNewPresentationIndexes(
        elementsRawData,
        std
      ),
    };

    const blockModels: GfxBlockElementModel[] = [];
    const canvasElements: GfxPrimitiveElementModel[] = [];
    const allElements: GfxModel[] = [];

    for (const data of elementsRawData) {
      const { data: blockSnapshot } = BlockSnapshotSchema.safeParse(data);
      if (blockSnapshot) {
        const oldId = blockSnapshot.id;

        const config = std.getOptional(
          EdgelessClipboardConfigIdentifier(blockSnapshot.flavour)
        );
        if (!config) continue;

        if (typeof blockSnapshot.props.index !== 'string') {
          console.error(`Block(id: ${oldId}) does not have index property`);
          continue;
        }
        const originalIndex = (blockSnapshot.props as GfxCompatibleProps).index;

        if (typeof blockSnapshot.props.xywh !== 'string') {
          console.error(`Block(id: ${oldId}) does not have xywh property`);
          continue;
        }

        assertType<GfxCompatibleProps>(blockSnapshot.props);

        blockSnapshot.props.xywh = getNewXYWH(
          blockSnapshot.props.xywh as SerializedXYWH
        );
        blockSnapshot.props.lockedBySelf = false;

        const newId = await config.createBlock(blockSnapshot, context);
        if (!newId) continue;

        const block = std.store.getBlock(newId);
        if (!block) continue;

        assertType<GfxBlockElementModel>(block.model);
        blockModels.push(block.model);
        allElements.push(block.model);
        context.oldToNewIdMap.set(oldId, newId);
        context.originalIndexes.set(oldId, originalIndex);
      } else {
        assertType<SerializedElement>(data);
        const oldId = data.id;

        const element = createCanvasElement(
          std,
          data,
          context,
          getNewXYWH(data.xywh)
        );

        if (!element) continue;

        canvasElements.push(element);
        allElements.push(element);

        context.oldToNewIdMap.set(oldId, element.id);
        context.originalIndexes.set(oldId, element.index);
      }
    }

    // remap old id to new id for the original index
    const oldIds = [...context.originalIndexes.keys()];
    oldIds.forEach(oldId => {
      const newId = context.oldToNewIdMap.get(oldId);
      const originalIndex = context.originalIndexes.get(oldId);
      if (newId && originalIndex) {
        context.originalIndexes.set(newId, originalIndex);
        context.originalIndexes.delete(oldId);
      }
    });

    updatePastedElementsIndex(std, allElements, context.originalIndexes);

    return {
      canvasElements: canvasElements,
      blockModels: blockModels,
    };
  };

  return next({
    createdElementsPromise: runner(),
  });
};

function updatePastedElementsIndex(
  std: BlockStdScope,
  elements: GfxModel[],
  originalIndexes: Map<string, string>
) {
  const gfx = std.get(GfxControllerIdentifier);
  const crud = std.get(EdgelessCRUDIdentifier);
  function compare(a: GfxModel, b: GfxModel) {
    if (a instanceof SurfaceGroupLikeModel && a.hasDescendant(b)) {
      return SortOrder.BEFORE;
    } else if (b instanceof SurfaceGroupLikeModel && b.hasDescendant(a)) {
      return SortOrder.AFTER;
    } else {
      const aGroups = a.groups as SurfaceGroupLikeModel[];
      const bGroups = b.groups as SurfaceGroupLikeModel[];

      let i = 1;
      let aGroup: GfxModel | undefined = aGroups.at(-i);
      let bGroup: GfxModel | undefined = bGroups.at(-i);

      while (aGroup === bGroup && aGroup) {
        ++i;
        aGroup = aGroups.at(-i);
        bGroup = bGroups.at(-i);
      }

      aGroup = aGroup ?? a;
      bGroup = bGroup ?? b;

      return originalIndexes.get(aGroup.id) === originalIndexes.get(bGroup.id)
        ? SortOrder.SAME
        : originalIndexes.get(aGroup.id)! < originalIndexes.get(bGroup.id)!
          ? SortOrder.BEFORE
          : SortOrder.AFTER;
    }
  }

  const idxGenerator = gfx.layer.createIndexGenerator();
  const sortedElements = elements.sort(compare);
  sortedElements.forEach(ele => {
    const newIndex = idxGenerator();

    crud.updateElement(ele.id, {
      index: newIndex,
    });
  });
}
