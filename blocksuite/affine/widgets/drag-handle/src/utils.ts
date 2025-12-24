import { type CalloutBlockComponent } from '@blocksuite/affine-block-callout';
import {
  AFFINE_EDGELESS_NOTE,
  EdgelessNoteBackground,
  EdgelessNoteBlockComponent,
} from '@blocksuite/affine-block-note';
import { ParagraphBlockComponent } from '@blocksuite/affine-block-paragraph';
import {
  DatabaseBlockModel,
  ListBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import {
  calcDropTarget,
  type DropTarget,
  findClosestBlockComponent,
  getBlockProps,
  getClosestBlockComponentByPoint,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import {
  Bound,
  Point,
  Rect,
  type SerializedXYWH,
} from '@blocksuite/global/gfx';
import type { BlockComponent, EditorHost } from '@blocksuite/std';
import type {
  BaseSelection,
  BlockModel,
  BlockSnapshot,
  SliceSnapshot,
} from '@blocksuite/store';

import {
  DRAG_HANDLE_CONTAINER_HEIGHT,
  DRAG_HANDLE_CONTAINER_OFFSET_LEFT,
  DRAG_HANDLE_CONTAINER_OFFSET_LEFT_LIST,
  EDGELESS_NOTE_EXTRA_PADDING,
  NOTE_CONTAINER_PADDING,
} from './config.js';

const heightMap: Record<string, number> = {
  text: 23,
  h1: 40,
  h2: 36,
  h3: 32,
  h4: 32,
  h5: 28,
  h6: 26,
  quote: 46,
  list: 24,
  database: 28,
  image: 28,
  divider: 36,
};

export const getDragHandleContainerHeight = (model: BlockModel) => {
  const flavour = model.flavour;
  const index = flavour.indexOf(':');
  let key = flavour.slice(index + 1);
  if (key === 'paragraph' && (model as ParagraphBlockModel).props.type) {
    key = (model as ParagraphBlockModel).props.type;
  }

  const height = heightMap[key] ?? DRAG_HANDLE_CONTAINER_HEIGHT;

  return height;
};

// To check if the block is a child block of the selected blocks
export const containChildBlock = (
  blocks: BlockComponent[],
  childModel: BlockModel
) => {
  return blocks.some(block => {
    let currentBlock: BlockModel | null = childModel;
    while (currentBlock) {
      if (currentBlock.id === block.model.id) {
        return true;
      }
      currentBlock = block.store.getParent(currentBlock.id);
    }
    return false;
  });
};

export const containBlock = (blockIDs: string[], targetID: string) => {
  return blockIDs.some(blockID => blockID === targetID);
};

export const extractIdsFromSnapshot = (snapshot: SliceSnapshot) => {
  const ids: string[] = [];
  const extractFromBlock = (block: BlockSnapshot) => {
    ids.push(block.id);

    if (block.children) {
      for (const child of block.children) {
        extractFromBlock(child);
      }
    }
  };

  for (const block of snapshot.content) {
    extractFromBlock(block);
  }

  return ids;
};

// TODO: this is a hack, need to find a better way
export const insideDatabaseTable = (element: Element) => {
  return !!element.closest('.affine-database-block-table');
};

export const includeTextSelection = (selections: BaseSelection[]) => {
  return selections.some(selection => selection.type === 'text');
};

/**
 * Check if the path of two blocks are equal
 */
export const isBlockIdEqual = (
  id1: string | null | undefined,
  id2: string | null | undefined
) => {
  if (!id1 || !id2) {
    return false;
  }
  return id1 === id2;
};

export const isOutOfNoteBlock = (
  editorHost: EditorHost,
  noteBlock: Element,
  point: Point,
  scale: number
) => {
  // TODO: need to find a better way to check if the point is out of note block
  const rect = noteBlock.getBoundingClientRect();
  const insidePageEditor =
    editorHost.std.get(DocModeProvider).getEditorMode() === 'page';
  const padding =
    (NOTE_CONTAINER_PADDING +
      (insidePageEditor ? 0 : EDGELESS_NOTE_EXTRA_PADDING)) *
    scale;
  return rect
    ? insidePageEditor
      ? point.y < rect.top ||
        point.y > rect.bottom ||
        point.x > rect.right + padding
      : point.y < rect.top ||
        point.y > rect.bottom ||
        point.x < rect.left - padding ||
        point.x > rect.right + padding
    : true;
};

export const getParentNoteBlock = (blockComponent: BlockComponent) => {
  return blockComponent.closest('affine-note, affine-edgeless-note') ?? null;
};

export const getClosestNoteBlock = (
  editorHost: EditorHost,
  rootComponent: BlockComponent,
  point: Point
) => {
  const isInsidePageEditor =
    editorHost.std.get(DocModeProvider).getEditorMode() === 'page';
  return isInsidePageEditor
    ? findClosestBlockComponent(rootComponent, point, 'affine-note')
    : getHoveringNote(point);
};

export const getClosestBlockByPoint = (
  editorHost: EditorHost,
  rootComponent: BlockComponent,
  point: Point
) => {
  const closestNoteBlock = getClosestNoteBlock(
    editorHost,
    rootComponent,
    point
  );
  if (!closestNoteBlock || closestNoteBlock.closest('.affine-surface-ref')) {
    return null;
  }

  const noteRect = Rect.fromDOM(closestNoteBlock);

  const block = getClosestBlockComponentByPoint(point, {
    container: closestNoteBlock,
    rect: noteRect,
  }) as BlockComponent | null;

  const blockSelector =
    '.affine-note-block-container > .affine-block-children-container > [data-block-id]';

  const closestBlock = (
    block && containChildBlock([closestNoteBlock], block.model)
      ? block
      : findClosestBlockComponent(
          closestNoteBlock as BlockComponent,
          point.clone(),
          blockSelector
        )
  ) as BlockComponent;

  if (!closestBlock || !!closestBlock.closest('.surface-ref-note-portal')) {
    return null;
  }

  if (matchModels(closestBlock.model, [ParagraphBlockModel])) {
    const callout =
      closestBlock.closest<CalloutBlockComponent>('affine-callout');
    if (callout) {
      return callout;
    }
  }

  return closestBlock;
};

export const getDropResult = (
  event: MouseEvent,
  scale: number = 1
): DropTarget | null => {
  let dropIndicator = null;
  const point = new Point(event.x, event.y);
  const closestBlock = getClosestBlockComponentByPoint(point) as BlockComponent;
  if (!closestBlock) {
    return dropIndicator;
  }

  const model = closestBlock.model;

  const isDatabase = matchModels(model, [DatabaseBlockModel]);
  if (isDatabase) {
    return dropIndicator;
  }

  const result = calcDropTarget(point, model, closestBlock, [], scale);
  if (result) {
    dropIndicator = result;
  }

  return dropIndicator;
};

export function getDragHandleLeftPadding(blocks: BlockComponent[]) {
  const hasToggleList = blocks.some(
    block =>
      (matchModels(block.model, [ListBlockModel]) &&
        block.model.children.length > 0) ||
      (block instanceof ParagraphBlockComponent &&
        block.model.props.type.startsWith('h') &&
        block.collapsedSiblings.length > 0)
  );
  const offsetLeft = hasToggleList
    ? DRAG_HANDLE_CONTAINER_OFFSET_LEFT_LIST
    : DRAG_HANDLE_CONTAINER_OFFSET_LEFT;
  return offsetLeft;
}

let previousEle: BlockComponent[] = [];
export function updateDragHandleClassName(blocks: BlockComponent[] = []) {
  const className = 'with-drag-handle';
  previousEle.forEach(block => block.classList.remove(className));
  previousEle = blocks;
  blocks.forEach(block => block.classList.add(className));
}

export function getDuplicateBlocks(blocks: BlockModel[]) {
  const duplicateBlocks = blocks.map(block => ({
    flavour: block.flavour,
    blockProps: getBlockProps(block),
  }));
  return duplicateBlocks;
}

/**
 * Get hovering note with given a point in edgeless mode.
 */
function getHoveringNote(point: Point) {
  const elements = document.elementsFromPoint(point.x, point.y);
  for (const el of elements) {
    if (el instanceof EdgelessNoteBlockComponent) {
      return el;
    }

    // When in edit mode for edgeless-note, the rect of note-background is larger than
    // that of edgeless-note. Therefore, when the point is located in the area between
    // note-background and edgeless-note, using elementsFromPoint alone cannot correctly
    // retrieve the edgeless-note.
    if (el instanceof EdgelessNoteBackground) {
      return el.closest(AFFINE_EDGELESS_NOTE) ?? null;
    }
  }
  return null;
}

export function getSnapshotRect(snapshot: SliceSnapshot): Bound | null {
  let bound: Bound | null = null;

  const getBound = (block: BlockSnapshot) => {
    if (block.flavour === 'affine:surface') {
      if (block.props.elements) {
        Object.values(
          block.props.elements as Record<
            string,
            { type: string; xywh: SerializedXYWH }
          >
        ).forEach(elem => {
          if (elem.xywh) {
            bound = bound
              ? bound.unite(Bound.deserialize(elem.xywh))
              : Bound.deserialize(elem.xywh);
          }

          if (elem.type === 'connector') {
            let connectorBound: Bound | undefined;

            if (elem.xywh) {
              connectorBound = Bound.deserialize(elem.xywh);
            }

            if (connectorBound) {
              bound = bound ? bound.unite(connectorBound) : connectorBound;
            }
          }
        });
      }

      block.children.forEach(getBound);
    } else if (block.props.xywh) {
      bound = bound
        ? bound.unite(Bound.deserialize(block.props.xywh as SerializedXYWH))
        : Bound.deserialize(block.props.xywh as SerializedXYWH);
    }
  };

  snapshot.content.forEach(getBound);

  return bound;
}
