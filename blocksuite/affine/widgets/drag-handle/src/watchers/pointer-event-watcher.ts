import type { NoteBlockComponent } from '@blocksuite/affine-block-note';
import { captureEventTarget } from '@blocksuite/affine-shared/utils';
import { Point } from '@blocksuite/global/gfx';
import {
  BLOCK_ID_ATTR,
  type BlockComponent,
  type PointerEventState,
  type UIEventHandler,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { computed } from '@preact/signals-core';
import throttle from 'lodash-es/throttle';

import {
  DRAG_HANDLE_CONTAINER_WIDTH,
  DRAG_HANDLE_GRABBER_BORDER_RADIUS,
  DRAG_HANDLE_GRABBER_HEIGHT,
  DRAG_HANDLE_GRABBER_WIDTH,
} from '../config.js';
import { AFFINE_DRAG_HANDLE_WIDGET } from '../consts.js';
import type { AffineDragHandleWidget } from '../drag-handle.js';
import {
  getClosestBlockByPoint,
  getClosestNoteBlock,
  getDragHandleContainerHeight,
  includeTextSelection,
  insideDatabaseTable,
  isBlockIdEqual,
  isOutOfNoteBlock,
  updateDragHandleClassName,
} from '../utils.js';

/**
 * Used to control the drag handle visibility in page mode
 */
export class PointerEventWatcher {
  private _isPointerDown = false;

  private get _gfx() {
    return this.widget.std.get(GfxControllerIdentifier);
  }

  private readonly _canEditing = (noteBlock: BlockComponent) => {
    if (noteBlock.store.id !== this.widget.store.id) return false;

    if (this.widget.mode === 'page') return true;

    const selection = this._gfx.selection;

    const noteBlockId = noteBlock.model.id;
    return selection.editing && selection.selectedIds[0] === noteBlockId;
  };

  /**
   * When click on drag handle
   * Should select the block and show slash menu if current block is not selected
   * Should clear selection if current block is the first selected block
   */
  private readonly _clickHandler: UIEventHandler = ctx => {
    if (!this.widget.isBlockDragHandleVisible) return;

    const state = ctx.get('pointerState');
    const { target } = state.raw;
    const element = captureEventTarget(target);
    const insideDragHandle = !!element?.closest(AFFINE_DRAG_HANDLE_WIDGET);
    if (!insideDragHandle) return;

    const anchorBlockId = this.widget.anchorBlockId.peek();

    if (!anchorBlockId) return;

    const { selection } = this.widget.std;
    const selectedBlocks = this.widget.selectionHelper.selectedBlocks;

    // Should clear selection if current block is the first selected block
    if (
      selectedBlocks.length > 0 &&
      !includeTextSelection(selectedBlocks) &&
      selectedBlocks[0].blockId === anchorBlockId
    ) {
      selection.clear(['block']);
      this.widget.dragHoverRect = null;
      this.showDragHandleOnHoverBlock();
      return;
    }

    // Should select the block if current block is not selected
    const block = this.widget.anchorBlockComponent.peek();
    if (!block) return;

    if (selectedBlocks.length > 1) {
      this.showDragHandleOnHoverBlock();
    }

    this.widget.selectionHelper.setSelectedBlocks([block]);
  };

  // Need to consider block padding and scale
  private readonly _getTopWithBlockComponent = (block: BlockComponent) => {
    const computedStyle = getComputedStyle(block);
    const { top } = block.getBoundingClientRect();
    const paddingTop =
      parseInt(computedStyle.paddingTop) * this.widget.scale.peek();
    return (
      top +
      paddingTop -
      this.widget.dragHandleContainerOffsetParent.getBoundingClientRect().top
    );
  };

  private readonly _containerStyle = computed(() => {
    const draggingAreaRect = this.widget.draggingAreaRect.value;
    if (!draggingAreaRect) return null;

    const block = this.widget.anchorBlockComponent.value;
    if (!block) return null;

    const containerHeight = getDragHandleContainerHeight(block.model);

    const posTop = this._getTopWithBlockComponent(block);

    const scaleInNote = this.widget.scaleInNote.value;

    const rowPaddingY =
      ((containerHeight - DRAG_HANDLE_GRABBER_HEIGHT) / 2 + 2) * scaleInNote;

    // use padding to control grabber's height
    const paddingTop = rowPaddingY + posTop - draggingAreaRect.top;
    const paddingBottom =
      draggingAreaRect.height -
      paddingTop -
      DRAG_HANDLE_GRABBER_HEIGHT * scaleInNote;

    return {
      paddingTop: `${paddingTop}px`,
      paddingBottom: `${paddingBottom}px`,
      width: `${DRAG_HANDLE_CONTAINER_WIDTH * scaleInNote}px`,
      left: `${draggingAreaRect.left}px`,
      top: `${draggingAreaRect.top}px`,
      height: `${draggingAreaRect.height}px`,
    };
  });

  private readonly _grabberStyle = computed(() => {
    const scaleInNote = this.widget.scaleInNote.value;
    return {
      width: `${DRAG_HANDLE_GRABBER_WIDTH * scaleInNote}px`,
      borderRadius: `${DRAG_HANDLE_GRABBER_BORDER_RADIUS * scaleInNote}px`,
    };
  });

  private _lastHoveredBlockId: string | null = null;

  private _lastShowedBlock: { id: string; el: BlockComponent } | null = null;

  /**
   * When pointer move on block, should show drag handle
   * And update hover block id and path
   */
  private readonly _pointerMoveOnBlock = (state: PointerEventState) => {
    if (this.widget.isGfxDragHandleVisible) return;

    const point = new Point(state.raw.x, state.raw.y);
    if (!this.widget.rootComponent) return;

    const closestBlock = getClosestBlockByPoint(
      this.widget.host,
      this.widget.rootComponent,
      point
    );
    if (!closestBlock) {
      this.widget.anchorBlockId.value = null;
      return;
    }

    const blockId = closestBlock.getAttribute(BLOCK_ID_ATTR);
    if (!blockId) return;

    this.widget.anchorBlockId.value = blockId;

    if (insideDatabaseTable(closestBlock) || this.widget.store.readonly) {
      this.widget.hide();
      return;
    }

    // If current block is not the last hovered block, show drag handle beside the hovered block
    if (
      (!this._lastHoveredBlockId ||
        !isBlockIdEqual(
          this.widget.anchorBlockId.peek(),
          this._lastHoveredBlockId
        ) ||
        !this.widget.isBlockDragHandleVisible) &&
      !this.widget.isDragHandleHovered
    ) {
      this.showDragHandleOnHoverBlock();
      this._lastHoveredBlockId = this.widget.anchorBlockId.peek();
    }
  };

  private readonly _pointerOutHandler: UIEventHandler = ctx => {
    const state = ctx.get('pointerState');
    state.raw.preventDefault();

    const { target } = state.raw;
    const element = captureEventTarget(target);
    if (!element) return;

    const { relatedTarget } = state.raw;
    // TODO: when pointer out of page viewport, should hide drag handle
    // But the pointer out event is not as expected
    // Need to be optimized
    const relatedElement = captureEventTarget(relatedTarget);
    const outOfPageViewPort = element.classList.contains(
      'affine-page-viewport'
    );
    const inPage = !!relatedElement?.closest('.affine-page-viewport');

    const inDragHandle = !!relatedElement?.closest(AFFINE_DRAG_HANDLE_WIDGET);
    if (outOfPageViewPort && !inDragHandle && !inPage) {
      this.widget.hide();
    }
  };

  private readonly _throttledPointerMoveHandler = throttle<UIEventHandler>(
    ctx => {
      if (this._isPointerDown) return;
      if (
        this.widget.store.readonly ||
        this.widget.dragging ||
        !this.widget.isConnected
      ) {
        this.widget.hide();
        return;
      }
      if (this.widget.isGfxDragHandleVisible) return;

      const state = ctx.get('pointerState');

      // When pointer is moving, should do nothing
      if (state.delta.x !== 0 && state.delta.y !== 0) return;

      const { target } = state.raw;
      const element = captureEventTarget(target);
      // When pointer not on block or on dragging, should do nothing
      if (!element) return;

      // When pointer on drag handle, should do nothing
      if (element.closest('.affine-drag-handle-container')) return;

      if (!this.widget.rootComponent) return;

      // When pointer out of note block hover area or inside database, should hide drag handle
      const point = new Point(state.raw.x, state.raw.y);

      const closestNoteBlock = getClosestNoteBlock(
        this.widget.host,
        this.widget.rootComponent,
        point
      ) as NoteBlockComponent | null;

      this.widget.noteScale.value =
        this.widget.mode === 'page'
          ? 1
          : (closestNoteBlock?.model.props.edgeless.scale ?? 1);

      if (
        closestNoteBlock &&
        this._canEditing(closestNoteBlock) &&
        !isOutOfNoteBlock(
          this.widget.host,
          closestNoteBlock,
          point,
          this.widget.scaleInNote.peek()
        )
      ) {
        this._pointerMoveOnBlock(state);
        return true;
      }

      if (this.widget.activeDragHandle) {
        this.widget.hide();
      }
      return false;
    },
    1000 / 60
  );

  // Multiple blocks: drag handle should show on the vertical middle of all blocks
  showDragHandleOnHoverBlock = () => {
    const block = this.widget.anchorBlockComponent.peek();
    if (!block) return;

    const container = this.widget.dragHandleContainer;
    const grabber = this.widget.dragHandleGrabber;
    if (!container || !grabber) return;

    this.widget.activeDragHandle = 'block';

    const draggingAreaRect = this.widget.draggingAreaRect.peek();
    if (!draggingAreaRect) return;

    // Ad-hoc solution for list with toggle icon
    updateDragHandleClassName([block]);
    // End of ad-hoc solution

    const applyStyle = (transition?: boolean) => {
      const containerStyle = this._containerStyle.value;
      if (!containerStyle) return;

      container.style.transition = transition ? 'padding 0.25s ease' : 'none';
      Object.assign(container.style, containerStyle);

      container.style.display = 'flex';
    };

    if (isBlockIdEqual(block.blockId, this._lastShowedBlock?.id)) {
      applyStyle(true);
    } else if (this.widget.selectionHelper.selectedBlocks.length) {
      if (this.widget.selectionHelper.isBlockSelected(block))
        applyStyle(
          this.widget.isDragHandleHovered &&
            this.widget.selectionHelper.isBlockSelected(
              this._lastShowedBlock?.el
            )
        );
      else applyStyle(false);
    } else {
      applyStyle(false);
    }

    const grabberStyle = this._grabberStyle.value;
    Object.assign(grabber.style, grabberStyle);

    this.widget.handleAnchorModelDisposables();
    if (!isBlockIdEqual(block.blockId, this._lastShowedBlock?.id)) {
      this._lastShowedBlock = {
        id: block.blockId,
        el: block,
      };
    }
  };

  private readonly _pointerDownHandler: UIEventHandler = () => {
    this._isPointerDown = true;
  };

  private readonly _pointerUpHandler: UIEventHandler = () => {
    this._isPointerDown = false;
  };

  constructor(readonly widget: AffineDragHandleWidget) {}

  reset() {
    this._lastHoveredBlockId = null;
    this._lastShowedBlock = null;
  }

  watch() {
    this.widget.handleEvent('click', this._clickHandler);
    this.widget.handleEvent('pointerMove', this._throttledPointerMoveHandler);
    this.widget.handleEvent('pointerOut', this._pointerOutHandler);
    this.widget.handleEvent('pointerDown', this._pointerDownHandler);
    this.widget.handleEvent('pointerUp', this._pointerUpHandler);
  }
}
