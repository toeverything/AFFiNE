import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import type { IVec, SerializedXYWH, XYWH } from '@blocksuite/global/gfx';
import {
  Bound,
  deserializeXYWH,
  getBoundWithRotation,
  getPointsFromBoundWithRotation,
  linePolygonIntersects,
  PointLocation,
  polygonGetPointTangent,
  polygonNearestPoint,
  rotatePoints,
} from '@blocksuite/global/gfx';
import type { Constructor } from '@blocksuite/global/utils';
import { BlockModel } from '@blocksuite/store';

import {
  isLockedByAncestorImpl,
  isLockedBySelfImpl,
  isLockedImpl,
  lockElementImpl,
  unlockElementImpl,
} from '../../utils/tree.js';
import type { EditorHost } from '../../view/index.js';
import type { GfxCompatibleInterface, PointTestOptions } from './base.js';
import type { GfxGroupModel } from './model.js';
import type { SurfaceBlockModel } from './surface/surface-model.js';

/**
 * The props that a graphics block model should have.
 */
export type GfxCompatibleProps = {
  xywh: SerializedXYWH;
  index: string;
  lockedBySelf?: boolean;
};

/**
 * This type include the common props for the graphic block model.
 * You can use this type with Omit to define the props of a graphic block model.
 */
export type GfxCommonBlockProps = GfxCompatibleProps & {
  rotate: number;
  scale: number;
};

/**
 * The graphic block model that can be rendered in the graphics mode.
 * All the graphic block model should extend this class.
 * You can use `GfxCompatibleBlockModel` to convert a BlockModel to a subclass that extends it.
 */
export class GfxBlockElementModel<
  Props extends GfxCompatibleProps = GfxCompatibleProps,
>
  extends BlockModel<Props>
  implements GfxCompatibleInterface
{
  private _cacheDeserKey: string | null = null;

  private _cacheDeserXYWH: XYWH | null = null;

  private _externalXYWH: SerializedXYWH | undefined = undefined;

  connectable = true;

  get xywh() {
    return this.props.xywh;
  }

  get xywh$() {
    return this.props.xywh$;
  }

  set xywh(xywh: SerializedXYWH) {
    this.props.xywh = xywh;
  }

  get index() {
    return this.props.index;
  }

  get index$() {
    return this.props.index$;
  }

  set index(index: string) {
    this.props.index = index;
  }

  get lockedBySelf(): boolean | undefined {
    return this.props.lockedBySelf;
  }

  get lockedBySelf$() {
    return this.props.lockedBySelf$;
  }

  set lockedBySelf(lockedBySelf: boolean | undefined) {
    this.props.lockedBySelf = lockedBySelf;
  }

  /**
   * Defines the extension of the response area beyond the element's bounding box.
   * This tuple specifies the horizontal and vertical margins to be added to the element's [x, y, width, height].
   *
   * The first value represents the horizontal extension (added to both left and right sides),
   * and the second value represents the vertical extension (added to both top and bottom sides).
   *
   * The response area is computed as:
   * `[x - horizontal, y - vertical, width + 2 * horizontal, height + 2 * vertical]`.
   *
   * Example:
   * - Bounding box: `[0, 0, 100, 100]`, `responseExtension: [10, 20]`
   *   Resulting response area: `[-10, -20, 120, 140]`.
   * - `responseExtension: [0, 0]` keeps the response area equal to the bounding box.
   */
  responseExtension: [number, number] = [0, 0];

  get rotate() {
    if ('rotate' in this.props) {
      return this.props.rotate as number;
    }

    return 0;
  }

  set rotate(rotate: number) {
    if ('rotate' in this.props) {
      this.props.rotate = rotate;
    }
  }

  get deserializedXYWH() {
    if (this._cacheDeserKey !== this.xywh || !this._cacheDeserXYWH) {
      this._cacheDeserKey = this.xywh;
      this._cacheDeserXYWH = deserializeXYWH(this.xywh);
    }

    return this._cacheDeserXYWH;
  }

  get elementBound() {
    return Bound.from(getBoundWithRotation(this));
  }

  get externalBound(): Bound | null {
    return this._externalXYWH ? Bound.deserialize(this._externalXYWH) : null;
  }

  get externalXYWH(): SerializedXYWH | undefined {
    return this._externalXYWH;
  }

  set externalXYWH(xywh: SerializedXYWH | undefined) {
    this._externalXYWH = xywh;
  }

  get group(): GfxGroupModel | null {
    if (!this.surface) return null;

    return this.surface.getGroup(this.id) ?? null;
  }

  get groups(): GfxGroupModel[] {
    if (!this.surface) return [];

    return this.surface.getGroups(this.id);
  }

  get h() {
    return this.deserializedXYWH[3];
  }

  get responseBound() {
    return this.elementBound.expand(this.responseExtension);
  }

  get surface(): SurfaceBlockModel | null {
    const result = this.store.getBlocksByFlavour('affine:surface');
    if (result.length === 0) return null;
    return result[0].model as SurfaceBlockModel;
  }

  get w() {
    return this.deserializedXYWH[2];
  }

  get x() {
    return this.deserializedXYWH[0];
  }

  get y() {
    return this.deserializedXYWH[1];
  }

  containsBound(bounds: Bound): boolean {
    const bound = Bound.deserialize(this.xywh);
    const points = getPointsFromBoundWithRotation({
      x: bound.x,
      y: bound.y,
      w: bound.w,
      h: bound.h,
      rotate: this.rotate,
    });
    return points.some(point => bounds.containsPoint(point));
  }

  getLineIntersections(start: IVec, end: IVec): PointLocation[] | null {
    const bound = Bound.deserialize(this.xywh);

    return linePolygonIntersects(
      start,
      end,
      rotatePoints(bound.points, bound.center, this.rotate ?? 0)
    );
  }

  getNearestPoint(point: IVec): IVec {
    const bound = Bound.deserialize(this.xywh);
    return polygonNearestPoint(
      rotatePoints(bound.points, bound.center, this.rotate ?? 0),
      point
    );
  }

  getRelativePointLocation(relativePoint: IVec): PointLocation {
    const bound = Bound.deserialize(this.xywh);
    const point = bound.getRelativePoint(relativePoint);
    const rotatePoint = rotatePoints(
      [point],
      bound.center,
      this.rotate ?? 0
    )[0];
    const points = rotatePoints(bound.points, bound.center, this.rotate ?? 0);
    const tangent = polygonGetPointTangent(points, rotatePoint);

    return new PointLocation(rotatePoint, tangent);
  }

  includesPoint(
    x: number,
    y: number,
    opt: PointTestOptions,
    __: EditorHost
  ): boolean {
    const bound = opt.useElementBound ? this.elementBound : this.responseBound;
    return bound.isPointInBound([x, y], 0);
  }

  intersectsBound(bound: Bound): boolean {
    return (
      this.containsBound(bound) ||
      bound.points.some((point, i, points) =>
        this.getLineIntersections(point, points[(i + 1) % points.length])
      )
    );
  }

  isLocked(): boolean {
    return isLockedImpl(this);
  }

  isLockedByAncestor(): boolean {
    return isLockedByAncestorImpl(this);
  }

  isLockedBySelf(): boolean {
    return isLockedBySelfImpl(this);
  }

  lock() {
    lockElementImpl(this.store, this);
  }

  unlock() {
    unlockElementImpl(this.store, this);
  }
}

/**
 * Convert a BlockModel to a GfxBlockElementModel.
 * @param BlockModelSuperClass The BlockModel class to be converted.
 * @returns The returned class is a subclass of the GfxBlockElementModel class and the given BlockModelSuperClass.
 */
export function GfxCompatibleBlockModel<
  Props extends GfxCompatibleProps,
  T extends Constructor<BlockModel<Props>> = Constructor<BlockModel<Props>>,
>(BlockModelSuperClass: T) {
  if (BlockModelSuperClass === BlockModel) {
    return GfxBlockElementModel as unknown as typeof GfxBlockElementModel<Props>;
  } else {
    let currentClass = BlockModelSuperClass;

    while (
      Object.getPrototypeOf(currentClass.prototype) !== BlockModel.prototype &&
      Object.getPrototypeOf(currentClass.prototype) !== null
    ) {
      currentClass = Object.getPrototypeOf(currentClass.prototype).constructor;
    }

    if (Object.getPrototypeOf(currentClass.prototype) === null) {
      throw new BlockSuiteError(
        ErrorCode.GfxBlockElementError,
        'The SuperClass is not a subclass of BlockModel'
      );
    }

    Object.setPrototypeOf(
      currentClass.prototype,
      GfxBlockElementModel.prototype
    );
  }

  return BlockModelSuperClass as unknown as typeof GfxBlockElementModel<Props>;
}
