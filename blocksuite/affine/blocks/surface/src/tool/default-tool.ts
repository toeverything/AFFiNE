import { resetNativeSelection } from '@blocksuite/affine-shared/utils';
import { DisposableGroup } from '@blocksuite/global/disposable';
import type { IVec } from '@blocksuite/global/gfx';
import type { PointerEventState } from '@blocksuite/std';
import {
  BaseTool,
  type GfxModel,
  InteractivityIdentifier,
  isGfxGroupCompatibleModel,
} from '@blocksuite/std/gfx';
import { effect } from '@preact/signals-core';

import { calPanDelta } from './panning-utils.js';

export enum DefaultModeDragType {
  /** Moving selected contents */
  ContentMoving = 'content-moving',
  /** Native range dragging inside active note block */
  NativeEditing = 'native-editing',
  /** Default void state */
  None = 'none',
  /** Expanding the dragging area, select the content covered inside */
  Selecting = 'selecting',
  /** Lasso selection mode - select elements by drawing a closed path */
  LassoSelecting = 'lasso-selecting',
}

export class DefaultTool extends BaseTool {
  static override toolName: string = 'default';

  private _edgeScrollingTimer: number | null = null;

  private readonly _clearDisposable = () => {
    if (this._disposables) {
      this._disposables.dispose();
      this._disposables = null;
    }
  };

  private readonly _clearSelectingState = () => {
    this._stopEdgeScrolling();
    this._clearDisposable();
  };

  private _disposables: DisposableGroup | null = null;

  private _scrollViewport(delta: IVec) {
    this.gfx.viewport.applyDeltaCenter(delta[0], delta[1]);
  }

  private _spaceTranslationRect: null | {
    w: number;
    h: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } = null;

  private readonly _enableEdgeScrolling = (delta: IVec) => {
    this._stopEdgeScrolling();
    this._scrollViewport(delta);

    this._edgeScrollingTimer = window.setInterval(() => {
      this._scrollViewport(delta);
    }, 30);
  };

  private readonly _stopEdgeScrolling = () => {
    if (this._edgeScrollingTimer) {
      clearInterval(this._edgeScrollingTimer);
      this._edgeScrollingTimer = null;
    }
  };

  private _toBeMoved: GfxModel[] = [];

  lassoPath: IVec[] = [];

  private _getLassoSelectedElements(): GfxModel[] {
    if (this.lassoPath.length < 3) return [];

    // Create a closed path by connecting the last point to the first point
    const closedPath = [...this.lassoPath];
    if (this.lassoPath.length > 0) {
      const firstPoint = this.lassoPath[0];
      const lastPoint = this.lassoPath[this.lassoPath.length - 1];
      // Only close the path if the last point is not already close to the first point
      if (
        Math.abs(firstPoint[0] - lastPoint[0]) > 5 ||
        Math.abs(firstPoint[1] - lastPoint[1]) > 5
      ) {
        closedPath.push(firstPoint);
      }
    }

    // Get all elements and filter those that are completely inside the lasso
    const allElements = this.gfx.getElementsByBound(
      this.gfx.viewport.viewportBounds
    );

    return allElements
      .filter(element => {
        const view = this.gfx.view.get(element);
        if (!view) return false;

        // Check if the element is completely inside the lasso path
        return this._isElementCompletelyInLasso(element, closedPath);
      })
      .filter(elm => !elm.isLocked());
  }

  private _isElementCompletelyInLasso(
    element: GfxModel,
    lassoPath: IVec[]
  ): boolean {
    // Get the element's bounding box points
    const bound = element.elementBound;
    const points = [
      [bound.x, bound.y],
      [bound.x + bound.w, bound.y],
      [bound.x + bound.w, bound.y + bound.h],
      [bound.x, bound.y + bound.h],
    ] as IVec[];

    // Check if all corner points of the element are inside the lasso path
    return points.every(point => this._isPointInPolygon(point, lassoPath));
  }

  private _isPointInPolygon(point: IVec, polygon: IVec[]): boolean {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];

      if (
        yi > y !== yj > y &&
        yj !== yi &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }

    return inside;
  }

  private readonly _updateSelection = () => {
    const { gfx } = this;

    if (gfx.keyboard.spaceKey$.peek() && this._spaceTranslationRect) {
      const { w, h, startX, startY, endX, endY } = this._spaceTranslationRect;
      const { endX: lastX, endY: lastY } = this.controller.draggingArea$.peek();

      const dx = lastX - endX;
      const dy = lastY - endY;

      this.controller.draggingArea$.value = {
        x: Math.min(startX + dx, lastX),
        y: Math.min(startY + dy, lastY),
        w,
        h,
        startX: startX + dx,
        startY: startY + dy,
        endX: endX + dx,
        endY: endY + dy,
      };
    }

    let elements: GfxModel[] | undefined;

    if (this.dragType === DefaultModeDragType.LassoSelecting) {
      // For lasso selection, check if elements are completely inside the lasso path
      elements = this._getLassoSelectedElements();
    } else {
      // For regular box selection
      elements = this.interactivity?.handleBoxSelection({
        box: this.controller.draggingArea$.peek(),
      });
    }

    if (!elements) return;

    this.selection.set({
      elements: elements.map(el => el.id),
      editing: false,
    });
  };

  dragType = DefaultModeDragType.None;

  movementDragging = false;

  /**
   * Get the end position of the dragging area in the model coordinate
   */
  get dragLastPos() {
    const { endX, endY } = this.controller.draggingArea$.peek();

    return [endX, endY] as IVec;
  }

  /**
   * Get the start position of the dragging area in the model coordinate
   */
  get dragStartPos() {
    const { startX, startY } = this.controller.draggingArea$.peek();

    return [startX, startY] as IVec;
  }

  get selection() {
    return this.gfx.selection;
  }

  get interactivity() {
    return this.std.getOptional(InteractivityIdentifier);
  }

  private async _cloneContent() {
    const clonedResult = await this.interactivity?.requestElementClone({
      elements: this._toBeMoved,
    });

    if (!clonedResult) return;

    this._toBeMoved = clonedResult.elements;
    this.selection.set({
      elements: this._toBeMoved.map(e => e.id),
      editing: false,
    });
  }

  private _determineDragType(evt: PointerEventState): DefaultModeDragType {
    const { x, y } = this.controller.lastMousePos$.peek();
    if (this.selection.isInSelectedRect(x, y)) {
      return this.selection.editing
        ? DefaultModeDragType.NativeEditing
        : DefaultModeDragType.ContentMoving;
    } else {
      const checked = this.interactivity?.handleElementSelection(evt);

      if (checked) {
        return DefaultModeDragType.ContentMoving;
      } else {
        // Check if alt key is pressed for lasso selection
        if (evt.keys.alt) {
          return DefaultModeDragType.LassoSelecting;
        }
        return DefaultModeDragType.Selecting;
      }
    }
  }

  private initializeDragState(
    dragType: DefaultModeDragType,
    event: PointerEventState
  ) {
    this.dragType = dragType;

    this._clearDisposable();
    this._disposables = new DisposableGroup();

    // If the drag type is selecting or lasso selecting, set up the dragging area disposable group
    // If the viewport updates when dragging, should update the dragging area and selection
    if (
      this.dragType === DefaultModeDragType.Selecting ||
      this.dragType === DefaultModeDragType.LassoSelecting
    ) {
      if (this.dragType === DefaultModeDragType.LassoSelecting) {
        // Initialize lasso path with the starting point
        const [startX, startY] = this.gfx.viewport.toModelCoord(
          event.x,
          event.y
        );
        this.lassoPath = [[startX, startY]];
      }

      this._disposables.add(
        this.gfx.viewport.viewportUpdated.subscribe(() => {
          if (
            (this.dragType === DefaultModeDragType.Selecting ||
              this.dragType === DefaultModeDragType.LassoSelecting) &&
            this.controller.dragging$.peek()
          ) {
            this._updateSelection();
          }
        })
      );
      return;
    }

    if (this.dragType === DefaultModeDragType.ContentMoving) {
      if (this.interactivity) {
        this.doc.captureSync();
        this.interactivity.handleElementMove({
          movingElements: this._toBeMoved,
          event: event.raw,
          onDragEnd: () => {
            this.doc.captureSync();
          },
        });
      }
      return;
    }
  }

  override click(e: PointerEventState) {
    if (this.doc.readonly) return;

    if (!this.interactivity?.handleElementSelection(e)) {
      this.selection.clear();
      resetNativeSelection(null);
    }

    this.interactivity?.dispatchEvent('click', e);
  }

  override deactivate() {
    this._stopEdgeScrolling();
    this._clearDisposable();
  }

  override doubleClick(e: PointerEventState) {
    if (this.doc.readonly) {
      const viewport = this.gfx.viewport;
      if (viewport.zoom === 1) {
        this.gfx.fitToScreen();
      } else {
        // Zoom to 100% and Center
        const [x, y] = viewport.toModelCoord(e.x, e.y);
        viewport.setViewport(1, [x, y], true);
      }
      return;
    }

    this.interactivity?.dispatchEvent('dblclick', e);
  }

  override dragEnd(e: PointerEventState) {
    this.interactivity?.dispatchEvent('dragend', e);

    if (this.selection.editing || !this.movementDragging) return;

    this.movementDragging = false;
    this._toBeMoved = [];

    // Clear lasso path when drag ends
    if (this.dragType === DefaultModeDragType.LassoSelecting) {
      this.lassoPath = [];
    }

    this._clearSelectingState();
    this.dragType = DefaultModeDragType.None;
  }

  override dragMove(e: PointerEventState) {
    this.interactivity?.dispatchEvent('dragmove', e);

    if (!this.movementDragging) {
      return;
    }

    const { viewport } = this.gfx;
    switch (this.dragType) {
      case DefaultModeDragType.Selecting: {
        // Record the last drag pointer position for auto panning and view port updating
        this._updateSelection();
        const moveDelta = calPanDelta(viewport, e);
        if (moveDelta) {
          this._enableEdgeScrolling(moveDelta);
        } else {
          this._stopEdgeScrolling();
        }
        break;
      }
      case DefaultModeDragType.LassoSelecting: {
        // Add current point to lasso path
        const [currentX, currentY] = this.gfx.viewport.toModelCoord(e.x, e.y);
        const lastPoint = this.lassoPath[this.lassoPath.length - 1];

        // Only add point if it's far enough from the last point to avoid too many points
        if (
          !lastPoint ||
          Math.abs(currentX - lastPoint[0]) > 2 ||
          Math.abs(currentY - lastPoint[1]) > 2
        ) {
          this.lassoPath.push([currentX, currentY]);
        }

        this._updateSelection();
        const moveDelta = calPanDelta(viewport, e);
        if (moveDelta) {
          this._enableEdgeScrolling(moveDelta);
        } else {
          this._stopEdgeScrolling();
        }
        break;
      }
      case DefaultModeDragType.ContentMoving: {
        break;
      }
      case DefaultModeDragType.NativeEditing: {
        // TODO reset if drag out of note
        break;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  override async dragStart(e: PointerEventState) {
    const { preventDefaultState, handledByView } =
      this.interactivity?.dispatchEvent('dragstart', e) ?? {};

    if (this.selection.editing || preventDefaultState || handledByView) return;

    this.movementDragging = true;

    // Determine the drag type based on the current state and event
    let dragType = this._determineDragType(e);

    const elements = this.selection.selectedElements;
    if (elements.some(e => e.isLocked())) return;

    const toBeMoved = new Set(elements);

    elements.forEach(element => {
      if (isGfxGroupCompatibleModel(element)) {
        element.descendantElements.forEach(ele => {
          toBeMoved.add(ele);
        });
      }
    });

    this._toBeMoved = Array.from(toBeMoved);

    // If alt key is pressed and content is moving, clone the content
    if (dragType === DefaultModeDragType.ContentMoving && e.keys.alt) {
      await this._cloneContent();
    }

    // Set up drag state
    this.initializeDragState(dragType, e);
  }

  override mounted() {
    this.disposable.add(
      effect(() => {
        const pressed = this.gfx.keyboard.spaceKey$.value;

        if (pressed) {
          const currentDraggingArea = this.controller.draggingArea$.peek();

          this._spaceTranslationRect = currentDraggingArea;
        } else {
          this._spaceTranslationRect = null;
        }
      })
    );
  }

  override pointerDown(e: PointerEventState): void {
    this.interactivity?.dispatchEvent('pointerdown', e);
  }

  override pointerMove(e: PointerEventState) {
    this.interactivity?.dispatchEvent('pointermove', e);
  }

  override pointerUp(e: PointerEventState) {
    this.interactivity?.dispatchEvent('pointerup', e);
  }

  override unmounted(): void {}
}
