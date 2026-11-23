import {
  EdgelessCRUDIdentifier,
  getSurfaceBlock,
} from '@blocksuite/affine/blocks/surface';
import { Bound } from '@blocksuite/affine/global/gfx';
import type { BlockStdScope } from '@blocksuite/affine/std';

import {
  type AIChatBlockModel,
  CHAT_BLOCK_HEIGHT,
  CHAT_BLOCK_WIDTH,
} from '../blocks';

/**
 * Calculates the bounding box for a child block
 * Based on the parent block's position and the existing connectors.
 * Place the child block to the right of the parent block as much as possible.
 * If the parent block already has connected child blocks
 * Distribute them evenly along the y-axis as much as possible.
 * @param parentModel - The model of the parent block.
 * @param service - The EdgelessRootService instance.
 * @returns The calculated bounding box for the child block.
 */
export function calcChildBound(
  parentModel: AIChatBlockModel,
  std: BlockStdScope
) {
  const surface = getSurfaceBlock(std.store);
  const crud = std.get(EdgelessCRUDIdentifier);
  const parentXYWH = Bound.deserialize(parentModel.xywh);
  const { x: parentX, y: parentY, w: parentWidth } = parentXYWH;

  const connectors = surface?.getConnectors(parentModel.id);
  const gapX = CHAT_BLOCK_WIDTH;
  const gapY = 60;
  const defaultX = parentX + parentWidth + gapX;
  const defaultY = parentY;
  if (!connectors?.length) {
    return new Bound(defaultX, defaultY, CHAT_BLOCK_WIDTH, CHAT_BLOCK_HEIGHT);
  } else {
    // Filter out the connectors which source is the parent block
    const childConnectors = connectors.filter(
      connector => connector.source.id === parentModel.id
    );
    // Get all the target blocks of the child connectors
    const targetBlocks = childConnectors
      .map(connector => connector.target.id)
      .filter(id => id !== undefined)
      .map(id => crud.getElementById(id))
      .filter(block => !!block);

    if (targetBlocks.length) {
      // Sort target blocks by their y position
      targetBlocks.sort(
        (a, b) => Bound.deserialize(a.xywh).y - Bound.deserialize(b.xywh).y
      );

      let x, y;
      // Calculate the position based on the number of target blocks
      const middleIndex = Math.floor((targetBlocks.length - 1) / 2);
      const middleBlock = targetBlocks[middleIndex];
      const { y: middleY, h: middleHeight } = Bound.deserialize(
        middleBlock.xywh
      );
      const lastBlock = targetBlocks[targetBlocks.length - 1];
      const {
        x: lastX,
        y: lastY,
        h: lastHeight,
      } = Bound.deserialize(lastBlock.xywh);

      if (targetBlocks.length % 2 === 0) {
        // If even number of target blocks
        // place the new bound above the middle block with same same gap as the last block
        x = lastX;
        const gap = lastY - (middleY + middleHeight);
        y = middleY - gap - CHAT_BLOCK_HEIGHT;
      } else {
        // If odd number of target blocks, place the new bound below the last block with a gap
        x = lastX;
        y = lastY + lastHeight + gapY;
      }

      return new Bound(x, y, CHAT_BLOCK_WIDTH, CHAT_BLOCK_HEIGHT);
    } else {
      // If no valid target blocks, fallback to default position
      return new Bound(defaultX, defaultY, CHAT_BLOCK_WIDTH, CHAT_BLOCK_HEIGHT);
    }
  }
}
