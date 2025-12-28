import { type Container, createIdentifier } from '@blocksuite/global/di';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { type Bound, type IVec } from '@blocksuite/global/gfx';
import type { Extension } from '@blocksuite/store';

import type { PointerEventState } from '../../event/index.js';
import type { EditorHost } from '../../view/index.js';
import type { GfxController } from '../index.js';
import type {
  BoxSelectionContext,
  DragEndContext,
  DragMoveContext,
  DragStartContext,
  GfxViewTransformInterface,
} from '../interactivity/index.js';
import type { GfxElementGeometry, PointTestOptions } from '../model/base.js';
import { GfxPrimitiveElementModel } from '../model/surface/element-model.js';
import type { GfxLocalElementModel } from '../model/surface/local-element-model.js';

export type EventsHandlerMap = {
  click: PointerEventState;
  dblclick: PointerEventState;
  pointerdown: PointerEventState;
  pointerenter: PointerEventState;
  pointerleave: PointerEventState;
  pointermove: PointerEventState;
  pointerup: PointerEventState;
  dragstart: PointerEventState;
  dragmove: PointerEventState;
  dragend: PointerEventState;
};

export type SupportedEvent = keyof EventsHandlerMap;

export const GfxElementModelViewExtIdentifier = createIdentifier<
  typeof GfxElementModelView
>('GfxElementModelView');

export class GfxElementModelView<
  T extends GfxLocalElementModel | GfxPrimitiveElementModel =
    | GfxPrimitiveElementModel
    | GfxLocalElementModel,
  RendererContext = object,
>
  implements GfxElementGeometry, Extension, GfxViewTransformInterface
{
  static type: string;

  private readonly _handlers = new Map<
    keyof EventsHandlerMap,
    ((evt: any) => void)[]
  >();

  private _isConnected = true;

  protected disposable = new DisposableGroup();

  readonly model: T;

  get isConnected() {
    return this._isConnected;
  }

  get rotate() {
    return this.model.rotate;
  }

  get surface() {
    return this.model.surface;
  }

  get type() {
    return this.model.type;
  }

  get std() {
    return this.gfx.std;
  }

  constructor(
    model: T,
    readonly gfx: GfxController
  ) {
    this.model = model;
  }

  static setup(di: Container): void {
    if (!this.type) {
      throw new BlockSuiteError(
        ErrorCode.ValueNotExists,
        'The GfxElementModelView should have a static `type` property.'
      );
    }

    di.addImpl(GfxElementModelViewExtIdentifier(this.type), () => this);
  }

  containsBound(bounds: Bound): boolean {
    return this.model.containsBound(bounds);
  }

  /**
   * Dispatches an event to the view.
   * @param event
   * @param evt
   * @returns Whether the event view has any handlers for the event.
   */
  dispatch<K extends keyof EventsHandlerMap>(
    event: K,
    evt: EventsHandlerMap[K]
  ) {
    const handlers = this._handlers.get(event);

    if (handlers?.length) {
      handlers.forEach(callback => callback(evt));
      return true;
    }

    return false;
  }

  getLineIntersections(start: IVec, end: IVec) {
    return this.model.getLineIntersections(start, end);
  }

  getNearestPoint(point: IVec) {
    return this.model.getNearestPoint(point);
  }

  getRelativePointLocation(relativePoint: IVec) {
    return this.model.getRelativePointLocation(relativePoint);
  }

  includesPoint(
    x: number,
    y: number,
    _: PointTestOptions,
    __: EditorHost
  ): boolean {
    return this.model.includesPoint(x, y, _, __);
  }

  intersectsBound(bound: Bound): boolean {
    return (
      this.containsBound(bound) ||
      bound.points.some((point, i, points) =>
        this.getLineIntersections(point, points[(i + 1) % points.length])
      )
    );
  }

  off<K extends keyof EventsHandlerMap>(
    event: K,
    callback: (evt: EventsHandlerMap[K]) => void
  ) {
    if (!this._handlers.has(event)) {
      return;
    }

    const callbacks = this._handlers.get(event)!;
    const index = callbacks.indexOf(callback);

    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  on<K extends keyof EventsHandlerMap>(
    event: K,
    callback: (evt: EventsHandlerMap[K]) => void
  ) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, []);
    }

    this._handlers.get(event)!.push(callback);

    return () => this.off(event, callback);
  }

  once<K extends keyof EventsHandlerMap>(
    event: K,
    callback: (evt: EventsHandlerMap[K]) => void
  ) {
    const off = this.on(event, evt => {
      off();
      callback(evt);
    });

    return off;
  }

  onCreated() {}

  onDragStart(_: DragStartContext) {
    if (this.model instanceof GfxPrimitiveElementModel) {
      this.model.stash('xywh');
    }
  }

  onDragEnd(_: DragEndContext) {
    if (this.model instanceof GfxPrimitiveElementModel) {
      this.model.pop('xywh');
    }
  }

  onDragMove({ dx, dy, currentBound }: DragMoveContext) {
    this.model.xywh = currentBound.moveDelta(dx, dy).serialize();
  }

  onBoxSelected(_: BoxSelectionContext): boolean | void {}

  /**
   * Called when the view is destroyed.
   * Override this method requires calling `super.onDestroyed()`.
   */
  onDestroyed() {
    this._isConnected = false;
    this.disposable.dispose();
    this._handlers.clear();
  }

  render(_: RendererContext) {}
}
