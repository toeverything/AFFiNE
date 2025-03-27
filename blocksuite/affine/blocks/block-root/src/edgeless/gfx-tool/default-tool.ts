import {
  type FrameOverlay,
  isFrameBlock,
} from '@blocksuite/affine-block-frame';
import {
  ConnectorUtils,
  OverlayIdentifier,
} from '@blocksuite/affine-block-surface';
import {
  type ConnectorElementModel,
  GroupElementModel,
  MindmapElementModel,
} from '@blocksuite/affine-model';
import { resetNativeSelection } from '@blocksuite/affine-shared/utils';
import type { BlockComponent, PointerEventState } from '@blocksuite/block-std';
import {
  BaseTool,
  getTopElements,
  type GfxModel,
  isGfxGroupCompatibleModel,
  type PointTestOptions,
  TransformManagerIdentifier,
} from '@blocksuite/block-std/gfx';
import { DisposableGroup } from '@blocksuite/global/disposable';
import type { IVec } from '@blocksuite/global/gfx';
import { Bound, getCommonBoundWithRotation, Vec } from '@blocksuite/global/gfx';
import { effect } from '@preact/signals-core';

import { createElementsFromClipboardDataCommand } from '../clipboard/command.js';
import { prepareCloneData } from '../utils/clone-utils.js';
import { calPanDelta } from '../utils/panning-utils.js';
import { isCanvasElement } from '../utils/query.js';
import { DefaultModeDragType } from './default-tool-ext/ext.js';

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

  private readonly _panViewport = (delta: IVec) => {
    this._accumulateDelta[0] += delta[0];
    this._accumulateDelta[1] += delta[1];
    this.gfx.viewport.applyDeltaCenter(delta[0], delta[1]);
  };

  // For moving the connector label
  private _selectedConnector: ConnectorElementModel | null = null;

  private _selectedConnectorLabelBounds: Bound | null = null;

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

    const { x, y, w, h } = this.controller.draggingArea$.peek();
    const bound = new Bound(x, y, w, h);

    let elements = gfx.getElementsByBound(bound).filter(el => {
      if (isFrameBlock(el)) {
        return el.childElements.length === 0 || bound.contains(el.elementBound);
      }
      if (el instanceof MindmapElementModel) {
        return bound.contains(el.elementBound);
      }
      return true;
    });

    elements = getTopElements(elements).filter(el => !el.isLocked());

    const set = new Set(
      gfx.keyboard.shiftKey$.peek()
        ? [...elements, ...gfx.selection.selectedElements]
        : elements
    );

    this.edgelessSelectionManager.set({
      elements: Array.from(set).map(element => element.id),
      editing: false,
    });
  };

  dragType = DefaultModeDragType.None;

  enableHover = true;

  private get _edgeless(): BlockComponent | null {
    return this.std.view.getBlock(this.doc.root!.id);
  }

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

  get edgelessSelectionManager() {
    return this.gfx.selection;
  }

  get elementTransformMgr() {
    return this.std.getOptional(TransformManagerIdentifier);
  }

  private get frameOverlay() {
    return this.std.get(OverlayIdentifier('frame')) as FrameOverlay;
  }

  private async _cloneContent() {
    if (!this._edgeless) return;

    const snapshot = prepareCloneData(this._toBeMoved, this.std);

    const bound = getCommonBoundWithRotation(this._toBeMoved);
    const [_, { createdElementsPromise }] = this.std.command.exec(
      createElementsFromClipboardDataCommand,
      {
        elementsRawData: snapshot,
        pasteCenter: bound.center,
      }
    );
    if (!createdElementsPromise) return;
    const { canvasElements, blockModels } = await createdElementsPromise;

    this._toBeMoved = [...canvasElements, ...blockModels];
    this.edgelessSelectionManager.set({
      elements: this._toBeMoved.map(e => e.id),
      editing: false,
    });
  }

  private _determineDragType(e: PointerEventState): DefaultModeDragType {
    const { x, y } = e;
    // Is dragging started from current selected rect
    if (this.edgelessSelectionManager.isInSelectedRect(x, y)) {
      if (this.edgelessSelectionManager.selectedElements.length === 1) {
        let selected = this.edgelessSelectionManager.selectedElements[0];
        // double check
        const currentSelected = this._pick(x, y);
        if (
          !isFrameBlock(selected) &&
          !(selected instanceof GroupElementModel) &&
          currentSelected &&
          currentSelected !== selected
        ) {
          selected = currentSelected;
          this.edgelessSelectionManager.set({
            elements: [selected.id],
            editing: false,
          });
        }

        if (
          isCanvasElement(selected) &&
          ConnectorUtils.isConnectorWithLabel(selected) &&
          (selected as ConnectorElementModel).labelIncludesPoint(
            this.gfx.viewport.toModelCoord(x, y)
          )
        ) {
          this._selectedConnector = selected as ConnectorElementModel;
          this._selectedConnectorLabelBounds = Bound.fromXYWH(
            this._selectedConnector.labelXYWH!
          );
          return DefaultModeDragType.ConnectorLabelMoving;
        }
      }

      return this.edgelessSelectionManager.editing
        ? DefaultModeDragType.NativeEditing
        : DefaultModeDragType.ContentMoving;
    } else {
      const selected = this._pick(x, y);
      if (selected) {
        this.edgelessSelectionManager.set({
          elements: [selected.id],
          editing: false,
        });

        if (
          isCanvasElement(selected) &&
          ConnectorUtils.isConnectorWithLabel(selected) &&
          (selected as ConnectorElementModel).labelIncludesPoint(
            this.gfx.viewport.toModelCoord(x, y)
          )
        ) {
          this._selectedConnector = selected as ConnectorElementModel;
          this._selectedConnectorLabelBounds = Bound.fromXYWH(
            this._selectedConnector.labelXYWH!
          );
          return DefaultModeDragType.ConnectorLabelMoving;
        }

        return DefaultModeDragType.ContentMoving;
      } else {
        return DefaultModeDragType.Selecting;
      }
    }
  }

  private _moveLabel(delta: IVec) {
    const connector = this._selectedConnector;
    let bounds = this._selectedConnectorLabelBounds;
    if (!connector || !bounds) return;
    bounds = bounds.clone();
    const center = connector.getNearestPoint(
      Vec.add(bounds.center, delta) as IVec
    );
    const distance = connector.getOffsetDistanceByPoint(center as IVec);
    bounds.center = center;
    this.gfx.updateElement(connector, {
      labelXYWH: bounds.toXYWH(),
      labelOffset: {
        distance,
      },
    });
  }

  private _pick(x: number, y: number, options?: PointTestOptions) {
    const modelPos = this.gfx.viewport.toModelCoord(x, y);

    const tryGetLockedAncestor = (e: GfxModel | null) => {
      if (e?.isLockedByAncestor()) {
        return e.groups.findLast(group => group.isLocked());
      }
      return e;
    };

    const result = this.gfx.getElementInGroup(
      modelPos[0],
      modelPos[1],
      options
    );

    if (result instanceof MindmapElementModel) {
      const picked = this.gfx.getElementByPoint(modelPos[0], modelPos[1], {
        ...((options ?? {}) as PointTestOptions),
        all: true,
      });

      let pickedIdx = picked.length - 1;

      while (pickedIdx >= 0) {
        const element = picked[pickedIdx];
        if (element === result) {
          pickedIdx -= 1;
          continue;
        }

        break;
      }

      return tryGetLockedAncestor(picked[pickedIdx]) ?? null;
    }

    return tryGetLockedAncestor(result);
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
      if (this.elementTransformMgr) {
        this.doc.captureSync();
        this.elementTransformMgr.initializeDrag({
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

    if (!this.elementTransformMgr?.dispatchOnSelected(e)) {
      this.edgelessSelectionManager.clear();
      resetNativeSelection(null);
    }

    this.elementTransformMgr?.dispatch('click', e);
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

    this.elementTransformMgr?.dispatch('dblclick', e);
  }

  override dragEnd() {
    if (this.edgelessSelectionManager.editing) return;

    this.frameOverlay.clear();
    this._toBeMoved = [];
    this._selectedConnector = null;
    this._selectedConnectorLabelBounds = null;
    this._clearSelectingState();
    this.dragType = DefaultModeDragType.None;
  }

  override dragMove(e: PointerEventState) {
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
      case DefaultModeDragType.ConnectorLabelMoving: {
        const dx = this.dragLastPos[0] - this.dragStartPos[0];
        const dy = this.dragLastPos[1] - this.dragStartPos[1];
        this._moveLabel([dx, dy]);
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
    if (this.edgelessSelectionManager.editing) return;
    // Determine the drag type based on the current state and event
    let dragType = this._determineDragType(e);

    const elements = this.edgelessSelectionManager.selectedElements;
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
    this.elementTransformMgr?.dispatch('pointerdown', e);
  }

  override pointerMove(e: PointerEventState) {
    const hovered = this._pick(e.x, e.y, {
      hitThreshold: 10,
    });

    if (
      isFrameBlock(hovered) &&
      hovered.externalBound?.isPointInBound(
        this.gfx.viewport.toModelCoord(e.x, e.y)
      )
    ) {
      this.frameOverlay.highlight(hovered);
    } else {
      this.frameOverlay.clear();
    }

    this.elementTransformMgr?.dispatch('pointermove', e);
  }

  override pointerUp(e: PointerEventState) {
    this.elementTransformMgr?.dispatch('pointerup', e);
  }

  override tripleClick() {}

  override unmounted(): void {}
}

declare module '@blocksuite/block-std/gfx' {
  interface GfxToolsMap {
    default: DefaultTool;
  }
}
