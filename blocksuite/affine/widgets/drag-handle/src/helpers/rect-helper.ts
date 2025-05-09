import { getCurrentNativeRange } from '@blocksuite/affine-shared/utils';
import { Rect } from '@blocksuite/global/gfx';
import type { BlockComponent } from '@blocksuite/std';

import {
  DRAG_HANDLE_CONTAINER_WIDTH,
  DRAG_HOVER_RECT_PADDING,
} from '../config.js';
import type { AffineDragHandleWidget } from '../drag-handle.js';
import {
  containBlock,
  getDragHandleLeftPadding,
  includeTextSelection,
} from '../utils.js';

export class RectHelper {
  private readonly _getHoveredBlocks = (): BlockComponent[] => {
    if (!this.widget.isBlockDragHandleVisible || !this.widget.anchorBlockId)
      return [];

    const hoverBlock = this.widget.anchorBlockComponent.peek();
    if (!hoverBlock) return [];

    const selections = this.widget.selectionHelper.selectedBlocks;
    let blocks: BlockComponent[] = [];

    // When current selection is TextSelection, should cover all the blocks in native range
    if (selections.length > 0 && includeTextSelection(selections)) {
      const range = getCurrentNativeRange();
      if (!range) return [];
      const rangeManager = this.widget.std.range;
      if (!rangeManager) return [];
      blocks = rangeManager.getSelectedBlockComponentsByRange(range, {
        match: el => el.model.role === 'content',
        mode: 'highest',
      });
    } else {
      blocks = this.widget.selectionHelper.selectedBlockComponents;
    }

    if (
      containBlock(
        blocks.map(block => block.blockId),
        this.widget.anchorBlockId.peek()!
      )
    ) {
      return blocks;
    }

    return [hoverBlock];
  };

  getDraggingAreaRect = (): Rect | null => {
    const block = this.widget.anchorBlockComponent.value;
    if (!block) return null;

    // When hover block is in selected blocks, should show hover rect on the selected blocks
    // Top: the top of the first selected block
    // Left: the left of the first selected block
    // Right: the largest right of the selected blocks
    // Bottom: the bottom of the last selected block
    let { left, top, right, bottom } = block.getBoundingClientRect();

    const blocks = this._getHoveredBlocks();

    blocks.forEach(block => {
      left = Math.min(left, block.getBoundingClientRect().left);
      top = Math.min(top, block.getBoundingClientRect().top);
      right = Math.max(right, block.getBoundingClientRect().right);
      bottom = Math.max(bottom, block.getBoundingClientRect().bottom);
    });

    const offsetLeft = getDragHandleLeftPadding(blocks);

    const offsetParentRect =
      this.widget.dragHandleContainerOffsetParent.getBoundingClientRect();
    if (!offsetParentRect) return null;

    left -= offsetParentRect.left;
    right -= offsetParentRect.left;
    top -= offsetParentRect.top;
    bottom -= offsetParentRect.top;

    const scaleInNote = this.widget.scaleInNote.value;
    // Add padding to hover rect
    left -= (DRAG_HANDLE_CONTAINER_WIDTH + offsetLeft) * scaleInNote;
    top -= DRAG_HOVER_RECT_PADDING * scaleInNote;
    right += DRAG_HOVER_RECT_PADDING * scaleInNote;
    bottom += DRAG_HOVER_RECT_PADDING * scaleInNote;

    return new Rect(left, top, right, bottom);
  };

  constructor(readonly widget: AffineDragHandleWidget) {}
}
