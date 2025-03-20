import type { EdgelessTextBlockComponent } from '@blocksuite/affine-block-edgeless-text';
import { EDGELESS_TEXT_BLOCK_MIN_WIDTH } from '@blocksuite/affine-block-edgeless-text';
import {
  EMBED_HTML_MIN_HEIGHT,
  EMBED_HTML_MIN_WIDTH,
  SYNCED_MIN_HEIGHT,
  SYNCED_MIN_WIDTH,
} from '@blocksuite/affine-block-embed';
import {
  EdgelessFrameManagerIdentifier,
  type FrameOverlay,
  isFrameBlock,
} from '@blocksuite/affine-block-frame';
import {
  CanvasElementType,
  isNoteBlock,
  normalizeShapeBound,
  OverlayIdentifier,
  TextUtils,
} from '@blocksuite/affine-block-surface';
import {
  type BookmarkBlockModel,
  ConnectorElementModel,
  type EdgelessTextBlockModel,
  type EmbedHtmlModel,
  type EmbedSyncedDocModel,
  FrameBlockModel,
  NOTE_MIN_HEIGHT,
  NOTE_MIN_WIDTH,
  NoteBlockModel,
  type RootBlockModel,
  ShapeElementModel,
  TextElementModel,
} from '@blocksuite/affine-model';
import { EMBED_CARD_HEIGHT } from '@blocksuite/affine-shared/consts';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import {
  getElementsWithoutGroup,
  getSelectedRect,
  requestThrottledConnectedFrame,
  stopPropagation,
} from '@blocksuite/affine-shared/utils';
import { WidgetComponent } from '@blocksuite/block-std';
import {
  type CursorType,
  getTopElements,
  GfxControllerIdentifier,
  type GfxModel,
  type GfxPrimitiveElementModel,
} from '@blocksuite/block-std/gfx';
import type { IPoint, IVec, PointLocation } from '@blocksuite/global/gfx';
import {
  Bound,
  deserializeXYWH,
  normalizeDegAngle,
} from '@blocksuite/global/gfx';
import { assertType } from '@blocksuite/global/utils';
import { css, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { styleMap } from 'lit/directives/style-map.js';
import clamp from 'lodash-es/clamp';
import { Subject, type Subscription } from 'rxjs';

import type { EdgelessRootBlockComponent } from '../../edgeless-root-block.js';
import {
  AI_CHAT_BLOCK_MAX_HEIGHT,
  AI_CHAT_BLOCK_MAX_WIDTH,
  AI_CHAT_BLOCK_MIN_HEIGHT,
  AI_CHAT_BLOCK_MIN_WIDTH,
} from '../../utils/consts.js';
import {
  getSelectableBounds,
  isAIChatBlock,
  isAttachmentBlock,
  isBookmarkBlock,
  isCanvasElement,
  isEdgelessTextBlock,
  isEmbeddedBlock,
  isEmbedFigmaBlock,
  isEmbedGithubBlock,
  isEmbedHtmlBlock,
  isEmbedLinkedDocBlock,
  isEmbedLoomBlock,
  isEmbedSyncedDocBlock,
  isEmbedYoutubeBlock,
  isImageBlock,
  isMindmapNode,
} from '../../utils/query.js';
import {
  HandleDirection,
  ResizeHandles,
  type ResizeMode,
} from '../resize/resize-handles.js';
import { HandleResizeManager } from '../resize/resize-manager.js';
import {
  calcAngle,
  calcAngleEdgeWithRotation,
  calcAngleWithRotation,
  generateCursorUrl,
  getResizeLabel,
  rotateResizeCursor,
} from '../utils.js';

export type SelectedRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  borderWidth: number;
  borderStyle: string;
  rotate: number;
};

export const EDGELESS_SELECTED_RECT_WIDGET = 'edgeless-selected-rect';

export class EdgelessSelectedRectWidget extends WidgetComponent<
  RootBlockModel,
  EdgelessRootBlockComponent
> {
  // disable change-in-update warning
  static override enabledWarnings = [];

  static override styles = css`
    :host {
      display: block;
      user-select: none;
      contain: size layout;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 1;
    }

    .affine-edgeless-selected-rect {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: center center;
      border-radius: 0;
      pointer-events: none;
      box-sizing: border-box;
      z-index: 1;
      border-color: var(--affine-blue);
      border-width: 2px;
      border-style: solid;
      transform: translate(0, 0) rotate(0);
    }

    .affine-edgeless-selected-rect[data-locked='true'] {
      border-color: ${unsafeCSSVarV2('edgeless/lock/locked', '#00000085')};
    }

    .affine-edgeless-selected-rect .handle {
      position: absolute;
      user-select: none;
      outline: none;
      pointer-events: auto;

      /**
       * Fix: pointerEvent stops firing after a short time.
       * When a gesture is started, the browser intersects the touch-action values of the touched element and its ancestors,
       * up to the one that implements the gesture (in other words, the first containing scrolling element)
       * https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
       */
      touch-action: none;
    }

    .affine-edgeless-selected-rect .handle[aria-label^='top-'],
    .affine-edgeless-selected-rect .handle[aria-label^='bottom-'] {
      width: 18px;
      height: 18px;
      box-sizing: border-box;
      z-index: 10;
    }

    .affine-edgeless-selected-rect .handle[aria-label^='top-'] .resize,
    .affine-edgeless-selected-rect .handle[aria-label^='bottom-'] .resize {
      position: absolute;
      width: 12px;
      height: 12px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 2px var(--affine-blue) solid;
      background: white;
    }

    .affine-edgeless-selected-rect .handle[aria-label^='top-'] .rotate,
    .affine-edgeless-selected-rect .handle[aria-label^='bottom-'] .rotate {
      position: absolute;
      width: 12px;
      height: 12px;
      box-sizing: border-box;
      background: transparent;
    }

    /* -18 + 6.5 */
    .affine-edgeless-selected-rect .handle[aria-label='top-left'] {
      left: -12px;
      top: -12px;
    }
    .affine-edgeless-selected-rect .handle[aria-label='top-left'] .resize {
      right: 0;
      bottom: 0;
    }
    .affine-edgeless-selected-rect .handle[aria-label='top-left'] .rotate {
      right: 6px;
      bottom: 6px;
    }

    .affine-edgeless-selected-rect .handle[aria-label='top-right'] {
      top: -12px;
      right: -12px;
    }
    .affine-edgeless-selected-rect .handle[aria-label='top-right'] .resize {
      left: 0;
      bottom: 0;
    }
    .affine-edgeless-selected-rect .handle[aria-label='top-right'] .rotate {
      left: 6px;
      bottom: 6px;
    }

    .affine-edgeless-selected-rect .handle[aria-label='bottom-right'] {
      right: -12px;
      bottom: -12px;
    }
    .affine-edgeless-selected-rect .handle[aria-label='bottom-right'] .resize {
      left: 0;
      top: 0;
    }
    .affine-edgeless-selected-rect .handle[aria-label='bottom-right'] .rotate {
      left: 6px;
      top: 6px;
    }

    .affine-edgeless-selected-rect .handle[aria-label='bottom-left'] {
      bottom: -12px;
      left: -12px;
    }
    .affine-edgeless-selected-rect .handle[aria-label='bottom-left'] .resize {
      right: 0;
      top: 0;
    }
    .affine-edgeless-selected-rect .handle[aria-label='bottom-left'] .rotate {
      right: 6px;
      top: 6px;
    }

    .affine-edgeless-selected-rect .handle[aria-label='top'],
    .affine-edgeless-selected-rect .handle[aria-label='bottom'],
    .affine-edgeless-selected-rect .handle[aria-label='left'],
    .affine-edgeless-selected-rect .handle[aria-label='right'] {
      border: 0;
      background: transparent;
      border-color: var('--affine-blue');
    }

    .affine-edgeless-selected-rect .handle[aria-label='left'],
    .affine-edgeless-selected-rect .handle[aria-label='right'] {
      top: 0;
      bottom: 0;
      height: 100%;
      width: 6px;
    }

    .affine-edgeless-selected-rect .handle[aria-label='top'],
    .affine-edgeless-selected-rect .handle[aria-label='bottom'] {
      left: 0;
      right: 0;
      width: 100%;
      height: 6px;
    }

    /* calc(-1px - (6px - 1px) / 2) = -3.5px */
    .affine-edgeless-selected-rect .handle[aria-label='left'] {
      left: -3.5px;
    }
    .affine-edgeless-selected-rect .handle[aria-label='right'] {
      right: -3.5px;
    }
    .affine-edgeless-selected-rect .handle[aria-label='top'] {
      top: -3.5px;
    }
    .affine-edgeless-selected-rect .handle[aria-label='bottom'] {
      bottom: -3.5px;
    }

    .affine-edgeless-selected-rect .handle[aria-label='top'] .resize,
    .affine-edgeless-selected-rect .handle[aria-label='bottom'] .resize,
    .affine-edgeless-selected-rect .handle[aria-label='left'] .resize,
    .affine-edgeless-selected-rect .handle[aria-label='right'] .resize {
      width: 100%;
      height: 100%;
    }

    .affine-edgeless-selected-rect .handle[aria-label='top'] .resize:after,
    .affine-edgeless-selected-rect .handle[aria-label='bottom'] .resize:after,
    .affine-edgeless-selected-rect .handle[aria-label='left'] .resize:after,
    .affine-edgeless-selected-rect .handle[aria-label='right'] .resize:after {
      position: absolute;
      width: 7px;
      height: 7px;
      box-sizing: border-box;
      border-radius: 6px;
      z-index: 10;
      content: '';
      background: white;
    }

    .affine-edgeless-selected-rect
      .handle[aria-label='top']
      .transparent-handle:after,
    .affine-edgeless-selected-rect
      .handle[aria-label='bottom']
      .transparent-handle:after,
    .affine-edgeless-selected-rect
      .handle[aria-label='left']
      .transparent-handle:after,
    .affine-edgeless-selected-rect
      .handle[aria-label='right']
      .transparent-handle:after {
      opacity: 0;
    }

    .affine-edgeless-selected-rect .handle[aria-label='left'] .resize:after,
    .affine-edgeless-selected-rect .handle[aria-label='right'] .resize:after {
      top: calc(50% - 6px);
    }

    .affine-edgeless-selected-rect .handle[aria-label='top'] .resize:after,
    .affine-edgeless-selected-rect .handle[aria-label='bottom'] .resize:after {
      left: calc(50% - 6px);
    }

    .affine-edgeless-selected-rect .handle[aria-label='left'] .resize:after {
      left: -0.5px;
    }
    .affine-edgeless-selected-rect .handle[aria-label='right'] .resize:after {
      right: -0.5px;
    }
    .affine-edgeless-selected-rect .handle[aria-label='top'] .resize:after {
      top: -0.5px;
    }
    .affine-edgeless-selected-rect .handle[aria-label='bottom'] .resize:after {
      bottom: -0.5px;
    }

    .affine-edgeless-selected-rect .handle .resize::before {
      content: '';
      display: none;
      position: absolute;
      width: 20px;
      height: 20px;
      background-image: url("data:image/svg+xml,%3Csvg width='26' height='26' viewBox='0 0 26 26' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M23 3H19C10.1634 3 3 10.1634 3 19V23' stroke='black' stroke-opacity='0.3' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E");
      background-size: contain;
      background-repeat: no-repeat;
    }
    .affine-edgeless-selected-rect[data-mode='scale']
      .handle[aria-label='top-left']
      .resize:hover::before,
    .affine-edgeless-selected-rect[data-scale-direction='top-left'][data-scale-percent]
      .handle[aria-label='top-left']
      .resize::before {
      display: block;
      top: 0px;
      left: 0px;
      transform: translate(-100%, -100%);
    }
    .affine-edgeless-selected-rect[data-mode='scale']
      .handle[aria-label='top-right']
      .resize:hover::before,
    .affine-edgeless-selected-rect[data-scale-direction='top-right'][data-scale-percent]
      .handle[aria-label='top-right']
      .resize::before {
      display: block;
      top: 0px;
      right: 0px;
      transform: translate(100%, -100%) rotate(90deg);
    }
    .affine-edgeless-selected-rect[data-mode='scale']
      .handle[aria-label='bottom-right']
      .resize:hover::before,
    .affine-edgeless-selected-rect[data-scale-direction='bottom-right'][data-scale-percent]
      .handle[aria-label='bottom-right']
      .resize::before {
      display: block;
      bottom: 0px;
      right: 0px;
      transform: translate(100%, 100%) rotate(180deg);
    }
    .affine-edgeless-selected-rect[data-mode='scale']
      .handle[aria-label='bottom-left']
      .resize:hover::before,
    .affine-edgeless-selected-rect[data-scale-direction='bottom-left'][data-scale-percent]
      .handle[aria-label='bottom-left']
      .resize::before {
      display: block;
      bottom: 0px;
      left: 0px;
      transform: translate(-100%, 100%) rotate(-90deg);
    }

    .affine-edgeless-selected-rect::after {
      content: attr(data-scale-percent);
      display: none;
      position: absolute;
      color: var(--affine-icon-color);
      font-feature-settings:
        'clig' off,
        'liga' off;
      font-family: var(--affine-font-family);
      font-size: 12px;
      font-style: normal;
      font-weight: 400;
      line-height: 24px;
    }
    .affine-edgeless-selected-rect[data-scale-direction='top-left']::after {
      display: block;
      top: -20px;
      left: -20px;
      transform: translate(-100%, -100%);
    }
    .affine-edgeless-selected-rect[data-scale-direction='top-right']::after {
      display: block;
      top: -20px;
      right: -20px;
      transform: translate(100%, -100%);
    }
    .affine-edgeless-selected-rect[data-scale-direction='bottom-right']::after {
      display: block;
      bottom: -20px;
      right: -20px;
      transform: translate(100%, 100%);
    }
    .affine-edgeless-selected-rect[data-scale-direction='bottom-left']::after {
      display: block;
      bottom: -20px;
      left: -20px;
      transform: translate(-100%, 100%);
    }
  `;

  private _cursorRotate = 0;

  private _dragEndCallback: (() => void)[] = [];

  private readonly _initSelectedSlot = () => {
    this._propDisposables.forEach(disposable => disposable.unsubscribe());
    this._propDisposables = [];

    this.selection.selectedElements.forEach(element => {
      if ('flavour' in element) {
        this._propDisposables.push(
          element.propsUpdated.subscribe(() => {
            this._updateOnElementChange(element.id);
          })
        );
      }
    });
  };

  private readonly _onDragEnd = () => {
    this.slots.dragEnd.next();

    this.doc.transact(() => {
      this._dragEndCallback.forEach(cb => cb());
    });

    this._dragEndCallback = [];
    this._isWidthLimit = false;
    this._isHeightLimit = false;

    this._updateCursor(false);

    this._scalePercent = undefined;
    this._scaleDirection = undefined;
    this._updateMode();

    this.block?.slots.elementResizeEnd.next();

    this.frameOverlay.clear();
  };

  private readonly _onDragMove = (
    newBounds: Map<
      string,
      {
        bound: Bound;
        path?: PointLocation[];
        matrix?: DOMMatrix;
      }
    >,
    direction: HandleDirection
  ) => {
    this.slots.dragMove.next();

    const { gfx } = this;

    newBounds.forEach(({ bound, matrix, path }, id) => {
      const element = gfx.getElementById(id) as GfxModel;
      if (!element) return;

      if (isNoteBlock(element)) {
        this.#adjustNote(element, bound, direction);
        return;
      }

      if (isEdgelessTextBlock(element)) {
        this.#adjustEdgelessText(element, bound, direction);
        return;
      }

      if (isEmbedSyncedDocBlock(element)) {
        this.#adjustEmbedSyncedDoc(element, bound, direction);
        return;
      }

      if (isEmbedHtmlBlock(element)) {
        this.#adjustEmbedHtml(element, bound, direction);
        return;
      }

      if (isAIChatBlock(element)) {
        this.#adjustAIChat(element, bound, direction);
        return;
      }

      if (this._isProportionalElement(element)) {
        this.#adjustProportional(element, bound, direction);
        return;
      }

      if (element instanceof TextElementModel) {
        this.#adjustText(element, bound, direction);
        return;
      }

      if (element instanceof ShapeElementModel) {
        this.#adjustShape(element, bound, direction);
        return;
      }

      if (element instanceof ConnectorElementModel && matrix && path) {
        this.#adjustConnector(element, bound, matrix, path);
        return;
      }

      if (element instanceof FrameBlockModel) {
        this.#adjustFrame(element, bound);
        return;
      }

      this.#adjustUseFallback(element, bound, direction);
    });
  };

  private readonly _onDragRotate = (center: IPoint, delta: number) => {
    this.slots.dragRotate.next();

    const { selection } = this;
    const m = new DOMMatrix()
      .translateSelf(center.x, center.y)
      .rotateSelf(delta)
      .translateSelf(-center.x, -center.y);

    const elements = selection.selectedElements.filter(
      element =>
        isImageBlock(element) ||
        isEdgelessTextBlock(element) ||
        isCanvasElement(element)
    );

    getElementsWithoutGroup(elements).forEach(element => {
      const { id, rotate } = element;
      const bounds = Bound.deserialize(element.xywh);
      const originalCenter = bounds.center;
      const point = new DOMPoint(...originalCenter).matrixTransform(m);
      bounds.center = [point.x, point.y];

      if (
        isCanvasElement(element) &&
        element instanceof ConnectorElementModel
      ) {
        this.#adjustConnector(
          element,
          bounds,
          m,
          element.absolutePath.map(p => p.clone())
        );
      } else {
        this.gfx.updateElement(id, {
          xywh: bounds.serialize(),
          rotate: normalizeDegAngle(rotate + delta),
        });
      }
    });

    this._updateCursor(true, { type: 'rotate', angle: delta });
    this._updateMode();
  };

  private readonly _onDragStart = () => {
    this.slots.dragStart.next();

    const rotation = this._resizeManager.rotation;

    this._dragEndCallback = [];
    this.block?.slots.elementResizeStart.next();
    this.selection.selectedElements.forEach(el => {
      el.stash('xywh');

      if (el instanceof NoteBlockModel) {
        el.stash('edgeless');
      }

      if (rotation) {
        el.stash('rotate' as 'xywh');
      }

      if (el instanceof TextElementModel && !rotation) {
        el.stash('fontSize');
        el.stash('hasMaxWidth');
      }

      this._dragEndCallback.push(() => {
        el.pop('xywh');

        if (el instanceof NoteBlockModel) {
          el.pop('edgeless');
        }

        if (rotation) {
          el.pop('rotate' as 'xywh');
        }

        if (el instanceof TextElementModel && !rotation) {
          el.pop('fontSize');
          el.pop('hasMaxWidth');
        }
      });
    });
    this._updateResizeManagerState(true);
  };

  private _propDisposables: Subscription[] = [];

  private readonly _resizeManager: HandleResizeManager;

  private readonly _updateCursor = (
    dragging: boolean,
    options?: {
      type: 'resize' | 'rotate';
      angle?: number;
      target?: HTMLElement;
      point?: IVec;
    }
  ) => {
    let cursor: CursorType = 'default';

    if (dragging && options) {
      const { type, target, point } = options;
      let { angle } = options;
      if (type === 'rotate') {
        if (target && point) {
          angle = calcAngle(target, point, 45);
        }
        this._cursorRotate += angle || 0;
        cursor = generateCursorUrl(this._cursorRotate);
      } else {
        if (this.resizeMode === 'edge') {
          cursor = 'ew-resize';
        } else if (target && point) {
          const label = getResizeLabel(target);
          const { width, height, left, top } = this._selectedRect;
          if (
            label === 'top' ||
            label === 'bottom' ||
            label === 'left' ||
            label === 'right'
          ) {
            angle = calcAngleEdgeWithRotation(
              target,
              this._selectedRect.rotate
            );
          } else {
            angle = calcAngleWithRotation(
              target,
              point,
              new DOMRect(
                left + this.gfx.viewport.left,
                top + this.gfx.viewport.top,
                width,
                height
              ),
              this._selectedRect.rotate
            );
          }
          cursor = rotateResizeCursor((angle * Math.PI) / 180);
        }
      }
    } else {
      this._cursorRotate = 0;
    }
    this.gfx.cursor$.value = cursor;
  };

  private readonly _updateMode = () => {
    if (this._cursorRotate) {
      this._mode = 'rotate';
      return;
    }

    const { selection } = this;
    const elements = selection.selectedElements;

    if (elements.length !== 1) this._mode = 'scale';

    const element = elements[0];

    if (isNoteBlock(element) || isEmbedSyncedDocBlock(element)) {
      this._mode = this._shiftKey ? 'scale' : 'resize';
    } else if (this._isProportionalElement(element)) {
      this._mode = 'scale';
    } else {
      this._mode = 'resize';
    }

    if (this._mode !== 'scale') {
      this._scalePercent = undefined;
      this._scaleDirection = undefined;
    }
  };

  private readonly _updateOnElementChange = (
    element: string | { id: string },
    fromRemote: boolean = false
  ) => {
    if ((fromRemote && this._resizeManager.dragging) || !this.isConnected) {
      return;
    }

    const id = typeof element === 'string' ? element : element.id;

    if (this._resizeManager.bounds.has(id) || this.selection.has(id)) {
      this._updateSelectedRect();
      this._updateMode();
    }
  };

  private readonly _updateOnSelectionChange = () => {
    this._initSelectedSlot();
    this._updateSelectedRect();
    this._updateResizeManagerState(true);
    // Reset the cursor
    this._updateCursor(false);
    this._updateMode();
  };

  private readonly _updateOnViewportChange = () => {
    if (this.selection.empty) {
      return;
    }

    this._updateSelectedRect();
    this._updateMode();
  };

  /**
   * @param refresh indicate whether to completely refresh the state of resize manager, otherwise only update the position
   */
  private readonly _updateResizeManagerState = (refresh: boolean) => {
    const {
      _resizeManager,
      _selectedRect,
      resizeMode,
      zoom,
      selection: { selectedElements },
    } = this;

    const rect = getSelectedRect(selectedElements);
    const proportion = selectedElements.some(element =>
      this._isProportionalElement(element)
    );
    // if there are more than one element, we need to refresh the state of resize manager
    if (selectedElements.length > 1) refresh = true;

    _resizeManager.updateState(
      resizeMode,
      _selectedRect.rotate,
      zoom,
      refresh ? undefined : rect,
      refresh ? rect : undefined,
      proportion
    );
    _resizeManager.updateBounds(getSelectableBounds(selectedElements));
  };

  @state()
  private accessor _selectedRect: SelectedRect = {
    width: 0,
    height: 0,
    left: 0,
    top: 0,
    rotate: 0,
    borderWidth: 0,
    borderStyle: 'solid',
  };

  private readonly _updateSelectedRect = requestThrottledConnectedFrame(() => {
    const { zoom, selection, gfx } = this;

    const elements = selection.selectedElements;
    // in surface
    const rect = getSelectedRect(elements);

    // in viewport
    const [left, top] = gfx.viewport.toViewCoord(rect.left, rect.top);
    const [width, height] = [rect.width * zoom, rect.height * zoom];

    let rotate = 0;
    if (elements.length === 1 && elements[0].rotate) {
      rotate = elements[0].rotate;
    }

    this._selectedRect = {
      width,
      height,
      left,
      top,
      rotate,
      borderStyle: 'solid',
      borderWidth: 2,
    };
  }, this);

  readonly slots = {
    dragStart: new Subject<void>(),
    dragMove: new Subject<void>(),
    dragRotate: new Subject<void>(),
    dragEnd: new Subject<void>(),
  };

  get dragDirection() {
    return this._resizeManager.dragDirection;
  }

  get edgelessSlots() {
    return this.block?.slots;
  }

  get frameOverlay() {
    return this.std.get(OverlayIdentifier('frame')) as FrameOverlay;
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get resizeMode(): ResizeMode {
    const elements = this.selection.selectedElements;

    let areAllConnectors = true;
    let areAllIndependentConnectors = elements.length > 1;
    let areAllShapes = true;
    let areAllTexts = true;
    let hasMindmapNode = false;

    for (const element of elements) {
      if (isNoteBlock(element) || isEmbedSyncedDocBlock(element)) {
        areAllConnectors = false;
        if (this._shiftKey) {
          areAllShapes = false;
          areAllTexts = false;
        }
      } else if (isEmbedHtmlBlock(element)) {
        areAllConnectors = false;
      } else if (isFrameBlock(element)) {
        areAllConnectors = false;
      } else if (this._isProportionalElement(element)) {
        areAllConnectors = false;
        areAllShapes = false;
        areAllTexts = false;
      } else if (isEdgelessTextBlock(element)) {
        areAllConnectors = false;
        areAllShapes = false;
      } else {
        assertType<GfxPrimitiveElementModel>(element);
        if (element.type === CanvasElementType.CONNECTOR) {
          const connector = element as ConnectorElementModel;
          areAllIndependentConnectors &&= !(
            connector.source.id || connector.target.id
          );
        } else {
          areAllConnectors = false;
        }
        if (
          element.type !== CanvasElementType.SHAPE &&
          element.type !== CanvasElementType.GROUP
        )
          areAllShapes = false;
        if (element.type !== CanvasElementType.TEXT) areAllTexts = false;

        if (isMindmapNode(element)) {
          hasMindmapNode = true;
        }
      }
    }

    if (areAllConnectors) {
      if (areAllIndependentConnectors) {
        return 'all';
      } else {
        return 'none';
      }
    }

    if (hasMindmapNode) return 'none';
    if (areAllShapes) return 'all';
    if (areAllTexts) return 'edgeAndCorner';

    return 'corner';
  }

  get selection() {
    return this.gfx.selection;
  }

  get surface() {
    return this.gfx.surface;
  }

  get zoom() {
    return this.gfx.viewport.zoom;
  }

  constructor() {
    super();
    this._resizeManager = new HandleResizeManager(
      this._onDragStart,
      this._onDragMove,
      this._onDragRotate,
      this._onDragEnd
    );
    this.addEventListener('pointerdown', stopPropagation);
  }

  /**
   * TODO: Remove this function after the edgeless refactor completed
   * This function is used to adjust the element bound and scale
   * Should not be used in the future
   * Related issue: https://linear.app/affine-design/issue/BS-1009/
   * @deprecated
   */
  #adjustAIChat(element: GfxModel, bound: Bound, direction: HandleDirection) {
    const curBound = Bound.deserialize(element.xywh);

    let scale = 1;
    if ('scale' in element) {
      scale = element.scale as number;
    }
    let width = curBound.w / scale;
    let height = curBound.h / scale;
    if (this._shiftKey) {
      scale = bound.w / width;
      this._scalePercent = `${Math.round(scale * 100)}%`;
      this._scaleDirection = direction;
    }

    width = bound.w / scale;
    width = clamp(width, AI_CHAT_BLOCK_MIN_WIDTH, AI_CHAT_BLOCK_MAX_WIDTH);
    bound.w = width * scale;

    height = bound.h / scale;
    height = clamp(height, AI_CHAT_BLOCK_MIN_HEIGHT, AI_CHAT_BLOCK_MAX_HEIGHT);
    bound.h = height * scale;

    this._isWidthLimit =
      width === AI_CHAT_BLOCK_MIN_WIDTH || width === AI_CHAT_BLOCK_MAX_WIDTH;
    this._isHeightLimit =
      height === AI_CHAT_BLOCK_MIN_HEIGHT ||
      height === AI_CHAT_BLOCK_MAX_HEIGHT;

    this.gfx.updateElement(element.id, {
      scale,
      xywh: bound.serialize(),
    });
  }

  #adjustConnector(
    element: ConnectorElementModel,
    bounds: Bound,
    matrix: DOMMatrix,
    originalPath: PointLocation[]
  ) {
    const props = element.resize(bounds, originalPath, matrix);
    this.gfx.updateElement(element.id, props);
  }

  #adjustEdgelessText(
    element: EdgelessTextBlockModel,
    bound: Bound,
    direction: HandleDirection
  ) {
    const oldXYWH = Bound.deserialize(element.xywh);
    if (
      direction === HandleDirection.TopLeft ||
      direction === HandleDirection.TopRight ||
      direction === HandleDirection.BottomRight ||
      direction === HandleDirection.BottomLeft
    ) {
      const newScale = element.props.scale * (bound.w / oldXYWH.w);
      this._scalePercent = `${Math.round(newScale * 100)}%`;
      this._scaleDirection = direction;

      bound.h = bound.w * (oldXYWH.h / oldXYWH.w);
      this.gfx.updateElement(element.id, {
        scale: newScale,
        xywh: bound.serialize(),
      });
    } else if (
      direction === HandleDirection.Left ||
      direction === HandleDirection.Right
    ) {
      const textPortal = this.host.view.getBlock(
        element.id
      ) as EdgelessTextBlockComponent | null;
      if (!textPortal) return;

      if (!textPortal.checkWidthOverflow(bound.w)) return;

      const newRealWidth = clamp(
        bound.w / element.props.scale,
        EDGELESS_TEXT_BLOCK_MIN_WIDTH,
        Infinity
      );
      bound.w = newRealWidth * element.props.scale;
      this.gfx.updateElement(element.id, {
        xywh: Bound.serialize({
          ...bound,
          h: oldXYWH.h,
        }),
        hasMaxWidth: true,
      });
    }
  }

  #adjustEmbedHtml(
    element: EmbedHtmlModel,
    bound: Bound,
    _direction: HandleDirection
  ) {
    bound.w = clamp(bound.w, EMBED_HTML_MIN_WIDTH, Infinity);
    bound.h = clamp(bound.h, EMBED_HTML_MIN_HEIGHT, Infinity);

    this._isWidthLimit = bound.w === EMBED_HTML_MIN_WIDTH;
    this._isHeightLimit = bound.h === EMBED_HTML_MIN_HEIGHT;

    this.gfx.updateElement(element.id, {
      xywh: bound.serialize(),
    });
  }

  #adjustEmbedSyncedDoc(
    element: EmbedSyncedDocModel,
    bound: Bound,
    direction: HandleDirection
  ) {
    const curBound = Bound.deserialize(element.xywh);

    let scale = element.props.scale ?? 1;
    let width = curBound.w / scale;
    let height = curBound.h / scale;
    if (this._shiftKey) {
      scale = bound.w / width;
      this._scalePercent = `${Math.round(scale * 100)}%`;
      this._scaleDirection = direction;
    }

    width = bound.w / scale;
    width = clamp(width, SYNCED_MIN_WIDTH, Infinity);
    bound.w = width * scale;

    height = bound.h / scale;
    height = clamp(height, SYNCED_MIN_HEIGHT, Infinity);
    bound.h = height * scale;

    this._isWidthLimit = width === SYNCED_MIN_WIDTH;
    this._isHeightLimit = height === SYNCED_MIN_HEIGHT;

    this.gfx.updateElement(element.id, {
      scale,
      xywh: bound.serialize(),
    });
  }

  #adjustFrame(frame: FrameBlockModel, bound: Bound) {
    const frameManager = this.std.get(EdgelessFrameManagerIdentifier);

    const oldChildren = frameManager.getChildElementsInFrame(frame);

    this.gfx.updateElement(frame.id, {
      xywh: bound.serialize(),
    });

    const newChildren = getTopElements(
      frameManager.getElementsInFrameBound(frame)
    ).concat(
      oldChildren.filter(oldChild => {
        return frame.intersectsBound(oldChild.elementBound);
      })
    );

    frameManager.removeAllChildrenFromFrame(frame);
    frameManager.addElementsToFrame(frame, newChildren);
    this.frameOverlay.highlight(frame, true, false);
  }

  #adjustNote(
    element: NoteBlockModel,
    bound: Bound,
    direction: HandleDirection
  ) {
    const curBound = Bound.deserialize(element.xywh);

    let scale = element.props.edgeless.scale ?? 1;
    if (this._shiftKey) {
      scale = (bound.w / curBound.w) * scale;
      this._scalePercent = `${Math.round(scale * 100)}%`;
      this._scaleDirection = direction;
    }

    bound.w = clamp(bound.w, NOTE_MIN_WIDTH * scale, Infinity);
    bound.h = clamp(bound.h, NOTE_MIN_HEIGHT * scale, Infinity);

    this._isWidthLimit = bound.w === NOTE_MIN_WIDTH * scale;
    this._isHeightLimit = bound.h === NOTE_MIN_HEIGHT * scale;

    if (bound.h > NOTE_MIN_HEIGHT * scale) {
      this.doc.updateBlock(element, () => {
        element.props.edgeless.collapse = true;
        element.props.edgeless.collapsedHeight = bound.h / scale;
      });
    }

    this.gfx.updateElement(element.id, {
      edgeless: {
        ...element.props.edgeless,
        scale,
      },
      xywh: bound.serialize(),
    });
  }

  #adjustProportional(
    element: GfxModel,
    bound: Bound,
    direction: HandleDirection
  ) {
    const curBound = Bound.deserialize(element.xywh);

    if (isImageBlock(element)) {
      const { height } = element.props;
      if (height) {
        this._scalePercent = `${Math.round((bound.h / height) * 100)}%`;
        this._scaleDirection = direction;
      }
    } else {
      const cardStyle = (element as BookmarkBlockModel).props.style;
      const height = EMBED_CARD_HEIGHT[cardStyle];
      this._scalePercent = `${Math.round((bound.h / height) * 100)}%`;
      this._scaleDirection = direction;
    }
    if (
      direction === HandleDirection.Left ||
      direction === HandleDirection.Right
    ) {
      bound.h = (curBound.h / curBound.w) * bound.w;
    } else if (
      direction === HandleDirection.Top ||
      direction === HandleDirection.Bottom
    ) {
      bound.w = (curBound.w / curBound.h) * bound.h;
    }

    this.gfx.updateElement(element.id, {
      xywh: bound.serialize(),
    });
  }

  #adjustShape(
    element: ShapeElementModel,
    bound: Bound,
    _direction: HandleDirection
  ) {
    bound = normalizeShapeBound(element, bound);
    this.gfx.updateElement(element.id, {
      xywh: bound.serialize(),
    });
  }

  #adjustText(
    element: TextElementModel,
    bound: Bound,
    direction: HandleDirection
  ) {
    let p = 1;
    if (
      direction === HandleDirection.Left ||
      direction === HandleDirection.Right
    ) {
      const {
        text: yText,
        fontFamily,
        fontSize,
        fontStyle,
        fontWeight,
        hasMaxWidth,
      } = element;
      // If the width of the text element has been changed by dragging,
      // We need to set hasMaxWidth to true for wrapping the text
      bound = TextUtils.normalizeTextBound(
        {
          yText,
          fontFamily,
          fontSize,
          fontStyle,
          fontWeight,
          hasMaxWidth,
        },
        bound,
        true
      );
      // If the width of the text element has been changed by dragging,
      // We need to set hasMaxWidth to true for wrapping the text
      this.gfx.updateElement(element.id, {
        xywh: bound.serialize(),
        fontSize: element.fontSize * p,
        hasMaxWidth: true,
      });
    } else {
      p = bound.h / element.h;
      // const newFontsize = element.fontSize * p;
      // bound = normalizeTextBound(element, bound, false, newFontsize);

      this.gfx.updateElement(element.id, {
        xywh: bound.serialize(),
        fontSize: element.fontSize * p,
      });
    }
  }

  #adjustUseFallback(
    element: GfxModel,
    bound: Bound,
    _direction: HandleDirection
  ) {
    this.gfx.updateElement(element.id, {
      xywh: bound.serialize(),
    });
  }

  private _canAutoComplete() {
    return (
      !this.autoCompleteOff &&
      !this._isResizing &&
      this.selection.selectedElements.length === 1 &&
      (this.selection.selectedElements[0] instanceof ShapeElementModel ||
        isNoteBlock(this.selection.selectedElements[0]))
    );
  }

  private _canRotate() {
    return !this.selection.selectedElements.every(
      ele =>
        isNoteBlock(ele) ||
        isFrameBlock(ele) ||
        isBookmarkBlock(ele) ||
        isAttachmentBlock(ele) ||
        isEmbeddedBlock(ele)
    );
  }

  private _isProportionalElement(element: GfxModel) {
    return (
      isAttachmentBlock(element) ||
      isImageBlock(element) ||
      isBookmarkBlock(element) ||
      isEmbedFigmaBlock(element) ||
      isEmbedGithubBlock(element) ||
      isEmbedYoutubeBlock(element) ||
      isEmbedLoomBlock(element) ||
      isEmbedLinkedDocBlock(element)
    );
  }

  private _shouldRenderSelection(elements?: GfxModel[]) {
    elements = elements ?? this.selection.selectedElements;
    return elements.length > 0 && !this.selection.editing;
  }

  override firstUpdated() {
    const { _disposables, block, selection, gfx } = this;

    _disposables.add(
      // viewport zooming / scrolling
      gfx.viewport.viewportUpdated.subscribe(this._updateOnViewportChange)
    );

    if (gfx.surface) {
      _disposables.add(
        gfx.surface.elementAdded.subscribe(this._updateOnElementChange)
      );
      _disposables.add(
        gfx.surface.elementRemoved.subscribe(this._updateOnElementChange)
      );
      _disposables.add(
        gfx.surface.elementUpdated.subscribe(this._updateOnElementChange)
      );
    }

    _disposables.add(
      this.doc.slots.blockUpdated.subscribe(this._updateOnElementChange)
    );

    _disposables.add(
      selection.slots.updated.subscribe(this._updateOnSelectionChange)
    );

    if (block) {
      _disposables.add(
        block.slots.readonlyUpdated.subscribe(() => this.requestUpdate())
      );

      _disposables.add(
        block.slots.elementResizeStart.subscribe(
          () => (this._isResizing = true)
        )
      );
      _disposables.add(
        block.slots.elementResizeEnd.subscribe(() => (this._isResizing = false))
      );

      block.handleEvent(
        'keyDown',
        ctx => {
          const event = ctx.get('defaultState').event;
          if (event instanceof KeyboardEvent) {
            this._shift(event);
          }
        },
        { global: true }
      );

      block.handleEvent(
        'keyUp',
        ctx => {
          const event = ctx.get('defaultState').event;
          if (event instanceof KeyboardEvent) {
            this._shift(event);
          }
        },
        { global: true }
      );
    }

    _disposables.add(() => {
      this._propDisposables.forEach(disposable => disposable.unsubscribe());
    });
  }

  private _shift(event: KeyboardEvent) {
    if (event.repeat) return;

    const pressed = event.key.toLowerCase() === 'shift' && event.shiftKey;

    this._shiftKey = pressed;
    this._resizeManager.onPressShiftKey(pressed);
    this._updateSelectedRect();
    this._updateMode();
  }

  override render() {
    if (!this.isConnected) return nothing;

    const { selection } = this;
    const elements = selection.selectedElements;

    if (!this._shouldRenderSelection(elements)) return nothing;

    const {
      block,
      gfx,
      doc,
      resizeMode,
      _resizeManager,
      _selectedRect,
      _updateCursor,
    } = this;

    const hasResizeHandles = !selection.editing && !doc.readonly;
    const inoperable = selection.inoperable;
    const hasElementLocked = elements.some(element => element.isLocked());
    const handlers = [];

    if (!inoperable) {
      const resizeHandles =
        hasResizeHandles && !hasElementLocked
          ? ResizeHandles(
              resizeMode,
              (e: PointerEvent, direction: HandleDirection) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('rotate') && !this._canRotate()) {
                  return;
                }
                const proportional = elements.some(
                  el => el instanceof TextElementModel
                );
                _resizeManager.onPointerDown(e, direction, proportional);
              },
              (
                dragging: boolean,
                options?: {
                  type: 'resize' | 'rotate';
                  angle?: number;
                  target?: HTMLElement;
                  point?: IVec;
                }
              ) => {
                if (!this._canRotate() && options?.type === 'rotate') return;
                _updateCursor(dragging, options);
              }
            )
          : nothing;

      const connectorHandle =
        elements.length === 1 &&
        elements[0] instanceof ConnectorElementModel &&
        !elements[0].isLocked()
          ? html`
              <edgeless-connector-handle
                .connector=${elements[0]}
                .edgeless=${block}
              ></edgeless-connector-handle>
            `
          : nothing;

      const elementHandle =
        elements.length > 1 &&
        !elements.reduce(
          (p, e) => p && e instanceof ConnectorElementModel,
          true
        )
          ? elements.map(element => {
              const [modelX, modelY, w, h] = deserializeXYWH(element.xywh);
              const [x, y] = gfx.viewport.toViewCoord(modelX, modelY);
              const { left, top, borderWidth } = this._selectedRect;
              const style = {
                position: 'absolute',
                boxSizing: 'border-box',
                left: `${x - left - borderWidth}px`,
                top: `${y - top - borderWidth}px`,
                width: `${w * this.zoom}px`,
                height: `${h * this.zoom}px`,
                transform: `rotate(${element.rotate}deg)`,
                border: `1px solid var(--affine-primary-color)`,
              };
              return html`<div
                class="element-handle"
                style=${styleMap(style)}
              ></div>`;
            })
          : nothing;

      handlers.push(resizeHandles, connectorHandle, elementHandle);
    }

    const isConnector =
      elements.length === 1 && elements[0] instanceof ConnectorElementModel;

    return html`
      <style>
        .affine-edgeless-selected-rect .handle[aria-label='right']::after {
          content: '';
          display: ${this._isWidthLimit ? 'initial' : 'none'};
          position: absolute;
          top: 0;
          left: 1.5px;
          width: 2px;
          height: 100%;
          background: var(--affine-error-color);
          filter: drop-shadow(-6px 0px 12px rgba(235, 67, 53, 0.35));
        }

        .affine-edgeless-selected-rect .handle[aria-label='bottom']::after {
          content: '';
          display: ${this._isHeightLimit ? 'initial' : 'none'};
          position: absolute;
          top: 1.5px;
          left: 0px;
          width: 100%;
          height: 2px;
          background: var(--affine-error-color);
          filter: drop-shadow(-6px 0px 12px rgba(235, 67, 53, 0.35));
        }
      </style>

      ${!doc.readonly && !inoperable && this._canAutoComplete()
        ? html`<edgeless-auto-complete
            .current=${this.selection.selectedElements[0]}
            .edgeless=${block}
            .selectedRect=${_selectedRect}
          >
          </edgeless-auto-complete>`
        : nothing}

      <div
        class="affine-edgeless-selected-rect"
        style=${styleMap({
          width: `${_selectedRect.width}px`,
          height: `${_selectedRect.height}px`,
          borderWidth: `${_selectedRect.borderWidth}px`,
          borderStyle: isConnector ? 'none' : _selectedRect.borderStyle,
          transform: `translate(${_selectedRect.left}px, ${_selectedRect.top}px) rotate(${_selectedRect.rotate}deg)`,
        })}
        disabled="true"
        data-mode=${this._mode}
        data-scale-percent=${ifDefined(this._scalePercent)}
        data-scale-direction=${ifDefined(this._scaleDirection)}
        data-locked=${hasElementLocked}
      >
        ${handlers}
      </div>
    `;
  }

  @state()
  private accessor _isHeightLimit = false;

  @state()
  private accessor _isResizing = false;

  @state()
  private accessor _isWidthLimit = false;

  @state()
  private accessor _mode: 'resize' | 'scale' | 'rotate' = 'resize';

  @state()
  private accessor _scaleDirection: HandleDirection | undefined = undefined;

  @state()
  private accessor _scalePercent: string | undefined = undefined;

  @state()
  private accessor _shiftKey = false;

  @state()
  accessor autoCompleteOff = false;
}
