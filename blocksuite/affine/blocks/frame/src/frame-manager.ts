import type { SurfaceBlockModel } from '@blocksuite/affine-block-surface';
import { Overlay } from '@blocksuite/affine-block-surface';
import type { FrameBlockModel } from '@blocksuite/affine-model';
import { EditPropsStore } from '@blocksuite/affine-shared/services';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import {
  Bound,
  deserializeXYWH,
  type IVec,
  type SerializedXYWH,
} from '@blocksuite/global/gfx';
import {
  generateKeyBetweenV2,
  getTopElements,
  GfxBlockElementModel,
  type GfxController,
  GfxExtension,
  GfxExtensionIdentifier,
  type GfxModel,
  isGfxGroupCompatibleModel,
  renderableInEdgeless,
} from '@blocksuite/std/gfx';
import { type BlockModel, Text } from '@blocksuite/store';
import * as Y from 'yjs';

const FRAME_PADDING = 40;

export type NavigatorMode = 'fill' | 'fit';

export class FrameOverlay extends Overlay {
  static override overlayName: string = 'frame';

  private _disposable = new DisposableGroup();

  private _frame: FrameBlockModel | null = null;

  private _innerElements = new Set<GfxModel>();

  private readonly _prevXYWH: SerializedXYWH | null = null;

  private get _frameManager() {
    return this.gfx.std.get(EdgelessFrameManagerIdentifier);
  }

  constructor(gfx: GfxController) {
    super(gfx);
  }

  private _reset() {
    this._disposable.dispose();
    this._disposable = new DisposableGroup();

    this._frame = null;
    this._innerElements.clear();
  }

  override clear() {
    if (this._frame === null && this._innerElements.size === 0) return;
    this._reset();
    this._renderer?.refresh();
  }

  highlight(
    frame: FrameBlockModel,
    highlightElementsInBound = false,
    highlightOutline = true
  ) {
    if (!highlightElementsInBound && !highlightOutline) return;

    let needRefresh = false;

    if (highlightOutline && this._prevXYWH !== frame.xywh) {
      needRefresh = true;
    }

    let innerElements = new Set<GfxModel>();
    if (highlightElementsInBound) {
      innerElements = new Set(
        getTopElements(
          this._frameManager.getElementsInFrameBound(frame)
        ).concat(
          this._frameManager.getChildElementsInFrame(frame).filter(child => {
            return frame.intersectsBound(child.elementBound);
          })
        )
      );
      if (!areSetsEqual(this._innerElements, innerElements)) {
        needRefresh = true;
      }
    }

    if (!needRefresh) return;

    this._reset();
    if (highlightOutline) this._frame = frame;
    if (highlightElementsInBound) this._innerElements = innerElements;

    const subscription = frame.deleted.subscribe(() => {
      subscription.unsubscribe();
      this.clear();
    });

    this._disposable.add(subscription);
    this._renderer?.refresh();
  }

  override render(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.strokeStyle = '#1E96EB';
    ctx.lineWidth = 2 / this.gfx.viewport.zoom;
    const radius = 2 / this.gfx.viewport.zoom;

    if (this._frame) {
      const { x, y, w, h } = this._frame.elementBound;
      ctx.roundRect(x, y, w, h, radius);
      ctx.stroke();
    }

    this._innerElements.forEach(element => {
      const [x, y, w, h] = deserializeXYWH(element.xywh);
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((element.rotate * Math.PI) / 180);
      ctx.roundRect(-w / 2, -h / 2, w, h, radius);
      ctx.translate(-x - w / 2, -y - h / 2);
      ctx.stroke();
    });
  }
}

export const EdgelessFrameManagerIdentifier =
  GfxExtensionIdentifier<EdgelessFrameManager>('frame-manager');

export class EdgelessFrameManager extends GfxExtension {
  static override key = 'frame-manager';

  private readonly _disposable = new DisposableGroup();

  /**
   * Get all sorted frames by presentation orderer,
   * the legacy frame that uses `index` as presentation order
   * will be put at the beginning of the array.
   */
  get frames() {
    return Object.values(this.gfx.doc.blocks.value)
      .map(({ model }) => model)
      .filter(isFrameBlock)
      .sort(EdgelessFrameManager.framePresentationComparator);
  }

  constructor(gfx: GfxController) {
    super(gfx);
    this._watchElementAdded();
  }

  static framePresentationComparator<
    T extends
      | FrameBlockModel
      | { props: { index: string; presentationIndex?: string } },
  >(a: T, b: T) {
    function stringCompare(a: string, b: string) {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    }

    const isModel = (
      x:
        | FrameBlockModel
        | { props: { index: string; presentationIndex?: string } }
    ): x is FrameBlockModel => {
      return 'presentationIndex$' in x;
    };

    if (
      isModel(a) &&
      isModel(b) &&
      a.props.presentationIndex$.value &&
      b.props.presentationIndex$.value
    ) {
      return stringCompare(
        a.props.presentationIndex$.value,
        b.props.presentationIndex$.value
      );
    } else if (a.props.presentationIndex && b.props.presentationIndex) {
      return stringCompare(
        a.props.presentationIndex,
        b.props.presentationIndex
      );
    } else if (a.props.presentationIndex) {
      return -1;
    } else if (b.props.presentationIndex) {
      return 1;
    } else {
      return stringCompare(a.props.index, b.props.index);
    }
  }

  private _addChildrenToLegacyFrame(frame: FrameBlockModel) {
    if (frame.props.childElementIds !== undefined) return;
    const elements = this.getElementsInFrameBound(frame);
    const childElements = elements.filter(
      element => this.getParentFrame(element) === null && element !== frame
    );

    frame.addChildren(childElements);
  }

  private _addFrameBlock(bound: Bound) {
    const surfaceModel = this.gfx.surface as SurfaceBlockModel;
    const props = this.gfx.std
      .get(EditPropsStore)
      .applyLastProps('affine:frame', {
        title: new Text(new Y.Text(`Frame ${this.frames.length + 1}`)),
        xywh: bound.serialize(),
        index: this.gfx.layer.generateIndex(true),
        presentationIndex: this.generatePresentationIndex(),
      });

    const id = this.gfx.doc.addBlock('affine:frame', props, surfaceModel);
    const frameModel = this.gfx.getElementById(id);

    if (!frameModel || !isFrameBlock(frameModel)) {
      throw new BlockSuiteError(
        ErrorCode.GfxBlockElementError,
        'Frame model is not found'
      );
    }

    return frameModel;
  }

  private _watchElementAdded() {
    if (!this.gfx.surface) {
      return;
    }

    const { surface: surfaceModel, doc } = this.gfx;

    this._disposable.add(
      surfaceModel.elementAdded.subscribe(({ id, local }) => {
        const element = surfaceModel.getElementById(id);
        if (element && local) {
          // The entire frame detection logic must be in microtask for timing reasons:
          //
          // 1. For connectors: When elementAdded fires, connectors have invalid bounds [0,0,0,0]
          //    because their path/bounds are calculated in a separate microtask of updateConnectorPath by connector-watcher.
          //    We need to wait for that calculation to complete before frame detection.
          //
          // 2. For shapes: Although they have valid bounds immediately, processing them in microtask
          //    ensures consistent timing and allows other initialization to complete first.
          //
          // 3. Group compatibility: Some elements may need to establish their group relationships
          //    before being considered for frame membership.
          //
          // By embedding the entire logic in microtask, we ensure:
          // - Connectors have proper bounds calculated (not [0,0,0,0])
          // - getFrameFromPoint() works correctly with valid element centers
          // - All element initialization is complete before frame detection
          queueMicrotask(() => {
            const frame = this.getFrameFromPoint(element.elementBound.center);

            // if the container created with a frame, skip it.
            if (
              isGfxGroupCompatibleModel(element) &&
              frame &&
              element.hasChild(frame)
            ) {
              return;
            }

            // Only add elements that aren't already grouped and have a valid frame
            if (!element.group && frame) {
              this.addElementsToFrame(frame, [element]);
            }
          });
        }
      })
    );

    this._disposable.add(
      doc.slots.blockUpdated.subscribe(payload => {
        if (
          payload.type === 'add' &&
          payload.model instanceof GfxBlockElementModel &&
          renderableInEdgeless(doc, surfaceModel, payload.model)
        ) {
          const frame = this.getFrameFromPoint(
            payload.model.elementBound.center,
            isFrameBlock(payload.model) ? [payload.model] : []
          );
          if (!frame) return;

          if (
            isFrameBlock(payload.model) &&
            payload.model.containsBound(frame.elementBound)
          ) {
            return;
          }
          this.addElementsToFrame(frame, [payload.model]);
        }
      })
    );
  }

  /**
   * Reset parent of elements to the frame
   */
  addElementsToFrame(frame: FrameBlockModel, elements: GfxModel[]) {
    if (frame.isLocked()) return;

    if (frame.props.childElementIds === undefined) {
      this._addChildrenToLegacyFrame(frame);
    }

    elements = elements.filter(
      el => el !== frame && !frame.childElements.includes(el)
    );

    if (elements.length === 0) return;

    frame.addChildren(elements);
  }

  createFrameOnBound(bound: Bound) {
    const frameModel = this._addFrameBlock(bound);

    this.addElementsToFrame(
      frameModel,
      getTopElements(this.getElementsInFrameBound(frameModel))
    );

    this.gfx.doc.captureSync();

    this.gfx.selection.set({
      elements: [frameModel.id],
      editing: false,
    });

    return frameModel;
  }

  createFrameOnElements(elements: GfxModel[]) {
    // make sure all elements are in the same level
    for (const element of elements) {
      if (element.group !== elements[0].group) return;
    }

    const parentFrameBound = this.getParentFrame(elements[0])?.elementBound;

    let bound = this.gfx.selection.selectedBound;

    if (parentFrameBound?.contains(bound)) {
      bound.x -= Math.min(0.5 * (bound.x - parentFrameBound.x), FRAME_PADDING);
      bound.y -= Math.min(0.5 * (bound.y - parentFrameBound.y), FRAME_PADDING);
      bound.w += Math.min(
        0.5 * (parentFrameBound.x + parentFrameBound.w - bound.x - bound.w),
        FRAME_PADDING
      );
      bound.h += Math.min(
        0.5 * (parentFrameBound.y + parentFrameBound.h - bound.y - bound.h),
        FRAME_PADDING
      );
    } else {
      bound = bound.expand(FRAME_PADDING);
    }

    const frameModel = this._addFrameBlock(bound);

    this.addElementsToFrame(frameModel, getTopElements(elements));

    this.gfx.doc.captureSync();

    this.gfx.selection.set({
      elements: [frameModel.id],
      editing: false,
    });

    return frameModel;
  }

  createFrameOnSelected() {
    return this.createFrameOnElements(this.gfx.selection.selectedElements);
  }

  createFrameOnViewportCenter(wh: [number, number]) {
    const center = this.gfx.viewport.center;
    const bound = new Bound(
      center.x - wh[0] / 2,
      center.y - wh[1] / 2,
      wh[0],
      wh[1]
    );

    this.createFrameOnBound(bound);
  }

  generatePresentationIndex() {
    const before =
      this.frames[this.frames.length - 1]?.props.presentationIndex ?? null;

    return generateKeyBetweenV2(before, null);
  }

  /**
   * Get all elements in the frame, there are three cases:
   * 1. The frame doesn't have `childElements`, return all elements in the frame bound but not owned by another frame.
   * 2. Return all child elements of the frame if `childElements` exists.
   */
  getChildElementsInFrame(frame: FrameBlockModel): GfxModel[] {
    if (frame.props.childElementIds === undefined) {
      return this.getElementsInFrameBound(frame).filter(
        element => this.getParentFrame(element) !== null
      );
    }

    const childElements = frame.childIds
      .map(id => this.gfx.getElementById(id))
      .filter(element => element !== null);

    return childElements as GfxModel[];
  }

  /**
   * Get all elements in the frame bound,
   * whatever the element already has another parent frame or not.
   */
  getElementsInFrameBound(frame: FrameBlockModel, fullyContained = true) {
    const bound = Bound.deserialize(frame.xywh);
    const elements: GfxModel[] = this.gfx.grid
      .search(bound, { strict: fullyContained })
      .filter(element => element !== frame);

    return elements;
  }

  /**
   * Get most top frame from the point.
   */
  getFrameFromPoint([x, y]: IVec, ignoreFrames: FrameBlockModel[] = []) {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const frame = this.frames[i];
      if (frame.includesPoint(x, y, {}) && !ignoreFrames.includes(frame)) {
        return frame;
      }
    }
    return null;
  }

  getParentFrame(element: GfxModel) {
    const container = element.group;
    return container && isFrameBlock(container) ? container : null;
  }

  /**
   * This method will populate `presentationIndex` for all legacy frames,
   * and keep the orderer of the legacy frames.
   */
  refreshLegacyFrameOrder() {
    const frames = this.frames.splice(0, this.frames.length);

    let splitIndex = frames.findIndex(frame => frame.props.presentationIndex);
    if (splitIndex === 0) return;

    if (splitIndex === -1) splitIndex = frames.length;

    let afterPreIndex =
      frames[splitIndex]?.props.presentationIndex ||
      generateKeyBetweenV2(null, null);

    for (let index = splitIndex - 1; index >= 0; index--) {
      const preIndex = generateKeyBetweenV2(null, afterPreIndex);
      frames[index].props.presentationIndex = preIndex;
      afterPreIndex = preIndex;
    }
  }

  removeAllChildrenFromFrame(frame: FrameBlockModel) {
    this.gfx.doc.transact(() => {
      frame.props.childElementIds = {};
    });
  }

  removeFromParentFrame(element: GfxModel) {
    const parentFrame = this.getParentFrame(element);
    // oxlint-disable-next-line unicorn/prefer-dom-node-remove
    parentFrame?.removeChild(element);
  }

  override unmounted(): void {
    this._disposable.dispose();
  }
}

function areSetsEqual<T>(setA: Set<T>, setB: Set<T>) {
  if (setA.size !== setB.size) return false;
  for (const a of setA) if (!setB.has(a)) return false;
  return true;
}

export function isFrameBlock(element: unknown): element is FrameBlockModel {
  return !!element && (element as BlockModel).flavour === 'affine:frame';
}
