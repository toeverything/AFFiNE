import {
  CanvasElementType,
  type ClipboardConfigCreationContext,
  EdgelessClipboardConfigIdentifier,
  EdgelessCRUDIdentifier,
  SurfaceGroupLikeModel,
} from '@blocksuite/affine-block-surface';
import type { Connection } from '@blocksuite/affine-model';
import { TelemetryProvider } from '@blocksuite/affine-shared/services';
import {
  Bound,
  getBoundWithRotation,
  type IVec,
  type SerializedXYWH,
  Vec,
} from '@blocksuite/global/gfx';
import { assertType } from '@blocksuite/global/utils';
import type { BlockStdScope } from '@blocksuite/std';
import {
  generateKeyBetweenV2,
  type GfxBlockElementModel,
  type GfxCompatibleProps,
  GfxControllerIdentifier,
  type GfxModel,
  type GfxPrimitiveElementModel,
  type SerializedElement,
  SortOrder,
} from '@blocksuite/std/gfx';
import { type BlockSnapshot, BlockSnapshotSchema } from '@blocksuite/store';
import * as Y from 'yjs';

import {
  EdgelessFrameManager,
  EdgelessFrameManagerIdentifier,
} from '../frame-manager';

type CreatedElements = {
  canvasElements: GfxPrimitiveElementModel[];
  blockModels: GfxBlockElementModel[];
};

const { GROUP, MINDMAP, CONNECTOR } = CanvasElementType;

export async function createElementsFromClipboardData(
  std: BlockStdScope,
  elementsRawData: (SerializedElement | BlockSnapshot)[],
  pasteCenter?: IVec
): Promise<CreatedElements> {
  const gfx = std.get(GfxControllerIdentifier);
  const toolManager = gfx.tool;

  if (!pasteCenter) {
    const lastMousePos = toolManager?.lastMousePos$?.peek();
    if (lastMousePos) {
      pasteCenter = [lastMousePos.x, lastMousePos.y];
    } else {
      const center = gfx.viewport.center;
      pasteCenter = [center.x, center.y];
    }
  }

  const [modelX, modelY] = pasteCenter;
  const oldCommonBound = edgelessElementsBoundFromRawData(elementsRawData);
  const pasteX = modelX - oldCommonBound.w / 2;
  const pasteY = modelY - oldCommonBound.h / 2;

  const getNewXYWH = (oldXYWH: SerializedXYWH) => {
    const oldBound = Bound.deserialize(oldXYWH);
    return new Bound(
      oldBound.x + pasteX - oldCommonBound.x,
      oldBound.y + pasteY - oldCommonBound.y,
      oldBound.w,
      oldBound.h
    ).serialize();
  };

  const context: ClipboardConfigCreationContext = {
    oldToNewIdMap: new Map<string, string>(),
    originalIndexes: new Map<string, string>(),
    newPresentationIndexes: createNewPresentationIndexes(elementsRawData, std),
  };

  const blockModels: GfxBlockElementModel[] = [];
  const canvasElements: GfxPrimitiveElementModel[] = [];
  const allElements: GfxModel[] = [];
  const deferredConnectors: SerializedElement[] = [];

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
      if (data.type === CanvasElementType.CONNECTOR) {
        deferredConnectors.push(data);
        continue;
      }
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

  for (const data of deferredConnectors) {
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
    canvasElements,
    blockModels,
  };
}

function createCanvasElement(
  std: BlockStdScope,
  clipboardData: SerializedElement,
  context: ClipboardConfigCreationContext,
  newXYWH: SerializedXYWH
) {
  if (clipboardData.type === GROUP) {
    const yMap = new Y.Map();
    const children = clipboardData.children ?? {};

    for (const [key, value] of Object.entries(children)) {
      const newKey = context.oldToNewIdMap.get(key);
      if (!newKey) {
        console.error(
          `Copy failed: cannot find the copied child in group, key: ${key}`
        );
        return null;
      }
      yMap.set(newKey, value);
    }
    clipboardData.children = yMap;
    clipboardData.xywh = newXYWH;
  } else if (clipboardData.type === MINDMAP) {
    const yMap = new Y.Map();
    const children = clipboardData.children ?? {};

    for (const [oldKey, oldValue] of Object.entries(children)) {
      const newKey = context.oldToNewIdMap.get(oldKey);
      const newValue = {
        ...oldValue,
      };
      if (!newKey) {
        console.error(
          `Copy failed: cannot find the copied node in mind map, key: ${oldKey}`
        );
        return null;
      }

      if (oldValue.parent) {
        const newParent = context.oldToNewIdMap.get(oldValue.parent);
        if (!newParent) {
          console.error(
            `Copy failed: cannot find the copied node in mind map, parent: ${oldValue.parent}`
          );
          return null;
        }
        newValue.parent = newParent;
      }

      yMap.set(newKey, newValue);
    }
    clipboardData.children = yMap;
  } else if (clipboardData.type === CONNECTOR) {
    const source = clipboardData.source as Connection;
    const target = clipboardData.target as Connection;

    const oldBound = Bound.deserialize(clipboardData.xywh);
    const newBound = Bound.deserialize(newXYWH);
    const offset = Vec.sub([newBound.x, newBound.y], [oldBound.x, oldBound.y]);

    if (source.id) {
      source.id = context.oldToNewIdMap.get(source.id) ?? source.id;
    } else if (source.position) {
      source.position = Vec.add(source.position, offset);
    }

    if (target.id) {
      target.id = context.oldToNewIdMap.get(target.id) ?? target.id;
    } else if (target.position) {
      target.position = Vec.add(target.position, offset);
    }

    if (Array.isArray(clipboardData.waypoints)) {
      clipboardData.waypoints = clipboardData.waypoints.map(wp =>
        Vec.add(wp, offset)
      );
    }
  } else {
    clipboardData.xywh = newXYWH;
  }

  clipboardData.lockedBySelf = false;

  const crud = std.get(EdgelessCRUDIdentifier);
  const id = crud.addElement(
    clipboardData.type as CanvasElementType,
    clipboardData
  );
  if (!id) {
    return null;
  }
  std.getOptional(TelemetryProvider)?.track('CanvasElementAdded', {
    control: 'canvas:paste',
    page: 'whiteboard editor',
    module: 'toolbar',
    segment: 'toolbar',
    type: clipboardData.type as string,
  });
  const element = crud.getElementById(id) as GfxPrimitiveElementModel;
  if (!element) {
    console.error(`Copy failed: cannot find the copied element, id: ${id}`);
    return null;
  }
  return element;
}

function createNewPresentationIndexes(
  raw: (SerializedElement | BlockSnapshot)[],
  std: BlockStdScope
) {
  const frames = raw
    .filter((block): block is BlockSnapshot => {
      const { data } = BlockSnapshotSchema.safeParse(block);
      return data?.flavour === 'affine:frame';
    })
    .sort((a, b) => EdgelessFrameManager.framePresentationComparator(a, b));

  const frameMgr = std.get(EdgelessFrameManagerIdentifier);
  let before = frameMgr.generatePresentationIndex();
  const result = new Map<string, string>();
  frames.forEach(frame => {
    result.set(frame.id, before);
    before = generateKeyBetweenV2(before, null);
  });

  return result;
}

function edgelessElementsBoundFromRawData(
  elementsRawData: (SerializedElement | BlockSnapshot)[]
) {
  if (elementsRawData.length === 0) return new Bound();

  let prev: Bound | null = null;

  for (const data of elementsRawData) {
    const { data: blockSnapshot } = BlockSnapshotSchema.safeParse(data);
    const bound = blockSnapshot
      ? getBoundFromGfxBlockSnapshot(blockSnapshot)
      : getBoundFromSerializedElement(data as SerializedElement);

    if (!bound) continue;
    if (!prev) prev = bound;
    else prev = prev.unite(bound);
  }

  return prev ?? new Bound();
}

function getBoundFromSerializedElement(element: SerializedElement) {
  return Bound.from(
    getBoundWithRotation({
      ...Bound.deserialize(element.xywh),
      rotate: typeof element.rotate === 'number' ? element.rotate : 0,
    })
  );
}

function getBoundFromGfxBlockSnapshot(snapshot: BlockSnapshot) {
  if (typeof snapshot.props.xywh !== 'string') return null;
  return Bound.deserialize(snapshot.props.xywh);
}

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
