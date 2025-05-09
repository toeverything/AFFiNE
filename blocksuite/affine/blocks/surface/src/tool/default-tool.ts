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
}

export class DefaultTool extends BaseTool {
  static override toolName: string = 'default';

  private _accumulateDelta: IVec = [0, 0];

  private _autoPanTimer: number | null = null;

  private readonly _clearDisposable = () => {
    if (this._disposables) {
      this._disposables.dispose();
      this._disposables = null;
    }
  };

  private readonly _clearSelectingState = () => {
    this._stopAutoPanning();
    this._clearDisposable();
  };

  private _disposables: DisposableGroup | null = null;

  private _panViewport(delta: IVec) {
    this._accumulateDelta[0] += delta[0];
    this._accumulateDelta[1] += delta[1];
    this.gfx.viewport.applyDeltaCenter(delta[0], delta[1]);
  }

  private _selectionRectTransition: null | {
    w: number;
    h: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } = null;

  private readonly _startAutoPanning = (delta: IVec) => {
    this._panViewport(delta);
    this._updateSelectingState(delta);
    this._stopAutoPanning();

    this._autoPanTimer = window.setInterval(() => {
      this._panViewport(delta);
      this._updateSelectingState(delta);
    }, 30);
  };

  private readonly _stopAutoPanning = () => {
    if (this._autoPanTimer) {
      clearTimeout(this._autoPanTimer);
      this._autoPanTimer = null;
    }
  };

  private _toBeMoved: GfxModel[] = [];

  private readonly _updateSelectingState = (delta: IVec = [0, 0]) => {
    const { gfx } = this;

    if (gfx.keyboard.spaceKey$.peek() && this._selectionRectTransition) {
      /* Move the selection if space is pressed */
      const curDraggingViewArea = this.controller.draggingViewArea$.peek();
      const { w, h, startX, startY, endX, endY } =
        this._selectionRectTransition;
      const { endX: lastX, endY: lastY } = curDraggingViewArea;

      const dx = lastX + delta[0] - endX + this._accumulateDelta[0];
      const dy = lastY + delta[1] - endY + this._accumulateDelta[1];

      this.controller.draggingViewArea$.value = {
        ...curDraggingViewArea,
        x: Math.min(startX + dx, lastX),
        y: Math.min(startY + dy, lastY),
        w,
        h,
        startX: startX + dx,
        startY: startY + dy,
      };
    } else {
      const curDraggingArea = this.controller.draggingViewArea$.peek();
      const newStartX = curDraggingArea.startX - delta[0];
      const newStartY = curDraggingArea.startY - delta[1];

      this.controller.draggingViewArea$.value = {
        ...curDraggingArea,
        startX: newStartX,
        startY: newStartY,
        x: Math.min(newStartX, curDraggingArea.endX),
        y: Math.min(newStartY, curDraggingArea.endY),
        w: Math.abs(curDraggingArea.endX - newStartX),
        h: Math.abs(curDraggingArea.endY - newStartY),
      };
    }

    const elements = this.interactivity?.handleBoxSelection({
      box: this.controller.draggingArea$.peek(),
    });

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
    const { x, y } = this.controller.lastMouseModelPos$.peek();
    if (this.selection.isInSelectedRect(x, y)) {
      if (this.selection.selectedElements.length === 1) {
        const currentHoveredElem = this._getElementInGroup(x, y);
        let curSelected = this.selection.selectedElements[0];

        // If one of the following condition is true, keep the selection:
        // 1. if group is currently selected
        // 2. if the selected element is descendant of the hovered element
        // 3. not hovering any element or hovering the same element
        //
        // Otherwise, we update the selection to the current hovered element
        const shouldKeepSelection =
          isGfxGroupCompatibleModel(curSelected) ||
          (isGfxGroupCompatibleModel(currentHoveredElem) &&
            currentHoveredElem.hasDescendant(curSelected)) ||
          !currentHoveredElem ||
          currentHoveredElem === curSelected;

        if (!shouldKeepSelection) {
          curSelected = currentHoveredElem;
          this.selection.set({
            elements: [curSelected.id],
            editing: false,
          });
        }
      }

      return this.selection.editing
        ? DefaultModeDragType.NativeEditing
        : DefaultModeDragType.ContentMoving;
    } else {
      const checked = this.interactivity?.handleElementSelection(evt);

      if (checked) {
        return DefaultModeDragType.ContentMoving;
      } else {
        return DefaultModeDragType.Selecting;
      }
    }
  }

  private _getElementInGroup(modelX: number, modelY: number) {
    const tryGetLockedAncestor = (e: GfxModel | null) => {
      if (e?.isLockedByAncestor()) {
        return e.groups.findLast(group => group.isLocked());
      }
      return e;
    };

    return tryGetLockedAncestor(this.gfx.getElementInGroup(modelX, modelY));
  }

  private initializeDragState(
    dragType: DefaultModeDragType,
    event: PointerEventState
  ) {
    this.dragType = dragType;

    this._clearDisposable();
    this._disposables = new DisposableGroup();

    // If the drag type is selecting, set up the dragging area disposable group
    // If the viewport updates when dragging, should update the dragging area and selection
    if (this.dragType === DefaultModeDragType.Selecting) {
      this._disposables.add(
        this.gfx.viewport.viewportUpdated.subscribe(() => {
          if (
            this.dragType === DefaultModeDragType.Selecting &&
            this.controller.dragging$.peek() &&
            !this._autoPanTimer
          ) {
            this._updateSelectingState();
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
    this._stopAutoPanning();
    this._clearDisposable();
    this._accumulateDelta = [0, 0];
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

        this._updateSelectingState();
        const moveDelta = calPanDelta(viewport, e);
        if (moveDelta) {
          this._startAutoPanning(moveDelta);
        } else {
          this._stopAutoPanning();
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
          const currentDraggingArea = this.controller.draggingViewArea$.peek();

          this._selectionRectTransition = {
            w: currentDraggingArea.w,
            h: currentDraggingArea.h,
            startX: currentDraggingArea.startX,
            startY: currentDraggingArea.startY,
            endX: currentDraggingArea.endX,
            endY: currentDraggingArea.endY,
          };
        } else {
          this._selectionRectTransition = null;
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
