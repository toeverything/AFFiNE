import { NoteBlockModel, RootBlockModel } from '@blocksuite/affine-model';
import { matchModels } from '@blocksuite/affine-shared/utils';
import {
  BLOCK_ID_ATTR,
  type BlockComponent,
  type PointerEventState,
} from '@blocksuite/std';

export type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type BlockInfo = {
  element: BlockComponent;
  rect: Rect;
};

function rectIntersects(a: Rect, b: Rect) {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

function rectIncludesTopAndBottom(a: Rect, b: Rect) {
  return a.top <= b.top && a.top + a.height >= b.top + b.height;
}

function filterBlockInfos(blockInfos: BlockInfo[], userRect: Rect) {
  const results: BlockInfo[] = [];
  for (const blockInfo of blockInfos) {
    const rect = blockInfo.rect;
    if (userRect.top + userRect.height < rect.top) break;

    results.push(blockInfo);
  }

  return results;
}

function filterBlockInfosByParent(
  parentInfos: BlockInfo,
  userRect: Rect,
  filteredBlockInfos: BlockInfo[]
) {
  const targetBlock = parentInfos.element;
  let results = [parentInfos];
  if (targetBlock.childElementCount > 0) {
    const childBlockInfos = targetBlock.childBlocks
      .map(el =>
        filteredBlockInfos.find(
          blockInfo => blockInfo.element.model.id === el.model.id
        )
      )
      .filter(block => block) as BlockInfo[];
    const firstIndex = childBlockInfos.findIndex(
      bl => rectIntersects(bl.rect, userRect) && bl.rect.top < userRect.top
    );
    const lastIndex = childBlockInfos.findIndex(
      bl =>
        rectIntersects(bl.rect, userRect) &&
        bl.rect.top + bl.rect.height > userRect.top + userRect.height
    );

    if (firstIndex !== -1 && lastIndex !== -1) {
      results = childBlockInfos.slice(firstIndex, lastIndex + 1);
    }
  }

  return results;
}

export function getSelectingBlockPaths(
  blockInfos: BlockInfo[],
  userRect: Rect
) {
  const filteredBlockInfos = filterBlockInfos(blockInfos, userRect);
  const len = filteredBlockInfos.length;
  const blockPaths: string[] = [];
  let singleTargetParentBlock: BlockInfo | null = null;
  let blocks: BlockInfo[] = [];
  if (len === 0) return blockPaths;

  // To get the single target parent block info
  for (const block of filteredBlockInfos) {
    const rect = block.rect;

    if (
      rectIntersects(userRect, rect) &&
      rectIncludesTopAndBottom(rect, userRect)
    ) {
      singleTargetParentBlock = block;
    }
  }

  if (singleTargetParentBlock) {
    blocks = filterBlockInfosByParent(
      singleTargetParentBlock,
      userRect,
      filteredBlockInfos
    );
  } else {
    // If there is no block contains the top and bottom of the userRect
    // Then get all the blocks that intersect with the userRect
    for (const block of filteredBlockInfos) {
      if (rectIntersects(userRect, block.rect)) {
        blocks.push(block);
      }
    }
  }

  // Filter out the blocks which parent is in the blocks
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const parent = blocks[i].element.store.getParent(block.element.model);
    const parentId = parent?.id;
    if (parentId) {
      const isParentInBlocks = blocks.some(
        block => block.element.model.id === parentId
      );
      if (!isParentInBlocks) {
        blockPaths.push(blocks[i].element.blockId);
      }
    }
  }

  return blockPaths;
}

export function isDragArea(e: PointerEventState) {
  const el = e.raw.target;
  if (!(el instanceof Element)) {
    return false;
  }
  const block = el.closest<BlockComponent>(`[${BLOCK_ID_ATTR}]`);
  if (!block) {
    return false;
  }
  return matchModels(block.model, [RootBlockModel, NoteBlockModel]);
}
