import {
  DRAG_HANDLE_CONTAINER_PADDING,
  DRAG_HANDLE_GRABBER_BORDER_RADIUS,
  DRAG_HANDLE_GRABBER_WIDTH_HOVERED,
} from '../config.js';
import type { AffineDragHandleWidget } from '../drag-handle.js';

export class HandleEventWatcher {
  private readonly _onDragHandlePointerDown = () => {
    if (!this.widget.isBlockDragHandleVisible || !this.widget.anchorBlockId)
      return;

    this.widget.dragHoverRect = this.widget.draggingAreaRect.value;
  };

  private readonly _onDragHandlePointerEnter = () => {
    const container = this.widget.dragHandleContainer;
    const grabber = this.widget.dragHandleGrabber;
    if (!container || !grabber) return;

    if (this.widget.isBlockDragHandleVisible && this.widget.anchorBlockId) {
      const block = this.widget.anchorBlockComponent;
      if (!block) return;

      const padding = DRAG_HANDLE_CONTAINER_PADDING * this.widget.scale.peek();
      container.style.paddingTop = `${padding}px`;
      container.style.paddingBottom = `${padding}px`;
      container.style.transition = `padding 0.25s ease`;

      grabber.style.width = `${
        DRAG_HANDLE_GRABBER_WIDTH_HOVERED * this.widget.scaleInNote.peek()
      }px`;
      grabber.style.borderRadius = `${
        DRAG_HANDLE_GRABBER_BORDER_RADIUS * this.widget.scaleInNote.peek()
      }px`;

      this.widget.isDragHandleHovered = true;
    } else if (this.widget.isGfxDragHandleVisible) {
      this.widget.dragHoverRect =
        this.widget.edgelessWatcher.hoveredElemAreaRect;
      this.widget.isDragHandleHovered = true;
    }
  };

  private readonly _onDragHandlePointerLeave = () => {
    this.widget.isDragHandleHovered = false;
    this.widget.dragHoverRect = null;

    if (this.widget.isGfxDragHandleVisible) return;

    if (this.widget.dragging) return;

    this.widget.pointerEventWatcher.showDragHandleOnHoverBlock();
  };

  private readonly _onDragHandlePointerUp = () => {
    if (!this.widget.isBlockDragHandleVisible) return;
    this.widget.dragHoverRect = null;
  };

  constructor(readonly widget: AffineDragHandleWidget) {}

  watch() {
    const { dragHandleContainer, disposables } = this.widget;

    // When pointer enter drag handle grabber
    // Extend drag handle grabber to the height of the hovered block
    disposables.addFromEvent(
      dragHandleContainer,
      'pointerenter',
      this._onDragHandlePointerEnter
    );

    disposables.addFromEvent(
      dragHandleContainer,
      'pointerdown',
      this._onDragHandlePointerDown
    );

    disposables.addFromEvent(
      dragHandleContainer,
      'pointerup',
      this._onDragHandlePointerUp
    );

    // When pointer leave drag handle grabber, should reset drag handle grabber style
    disposables.addFromEvent(
      dragHandleContainer,
      'pointerleave',
      this._onDragHandlePointerLeave
    );
  }
}
