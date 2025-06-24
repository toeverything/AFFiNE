import type {
  Bound,
  IBound,
  IVec,
  PointLocation,
  SerializedXYWH,
  XYWH,
} from '@blocksuite/global/gfx';

import type { EditorHost } from '../../view/element/lit-host.js';
import type { GfxGroupModel, GfxModel } from './model.js';

/**
 * The methods that a graphic element should implement.
 * It is already included in the `GfxCompatibleInterface` interface.
 */
export interface GfxElementGeometry {
  containsBound(bound: Bound): boolean;
  getNearestPoint(point: IVec): IVec;
  getLineIntersections(start: IVec, end: IVec): PointLocation[] | null;
  getRelativePointLocation(point: IVec): PointLocation;
  includesPoint(
    x: number,
    y: number,
    options: PointTestOptions,
    host: EditorHost
  ): boolean;
  intersectsBound(bound: Bound): boolean;
}

/**
 * All the model that can be rendered in graphics mode should implement this interface.
 */
export interface GfxCompatibleInterface extends IBound, GfxElementGeometry {
  xywh: SerializedXYWH;
  index: string;

  /**
   * Defines the extension of the response area beyond the element's bounding box.
   * This tuple specifies the horizontal and vertical margins to be added to the element's bound.
   *
   * The first value represents the horizontal extension (added to both left and right sides),
   * and the second value represents the vertical extension (added to both top and bottom sides).
   *
   * The response area is computed as:
   * `[x - horizontal, y - vertical, w + 2 * horizontal, h + 2 * vertical]`.
   *
   * Example:
   * - xywh: `[0, 0, 100, 100]`, `responseExtension: [10, 20]`
   *   Resulting response area: `[-10, -20, 120, 140]`.
   * - `responseExtension: [0, 0]` keeps the response area equal to the bounding box.
   */
  responseExtension: [number, number];

  readonly group: GfxGroupCompatibleInterface | null;

  readonly groups: GfxGroupCompatibleInterface[];

  readonly deserializedXYWH: XYWH;

  /**
   * The bound of the element without considering the response extension.
   */
  readonly elementBound: Bound;

  /**
   * The bound of the element considering the response extension.
   */
  readonly responseBound: Bound;

  /**
   * Indicates whether the current block is explicitly locked by self.
   * For checking the lock status of the element, use `isLocked` instead.
   * For (un)locking the element, use `(un)lock` instead.
   */
  lockedBySelf?: boolean;

  /**
   * Check if the element is locked. It will check the lock status of the element and its ancestors.
   */
  isLocked(): boolean;
  isLockedBySelf(): boolean;
  isLockedByAncestor(): boolean;

  lock(): void;
  unlock(): void;

  /**
   * Whether to disable fallback rendering for this element, e.g., during zooming.
   * Defaults to false (fallback to placeholder rendering is enabled).
   */
  forceFullRender?: boolean;
}

/**
 * The symbol to mark a model as a container.
 */
export const gfxGroupCompatibleSymbol = Symbol('GfxGroupCompatible');

/**
 * Check if the element is a container element.
 */
export const isGfxGroupCompatibleModel = (
  elm: unknown
): elm is GfxGroupModel => {
  if (typeof elm !== 'object' || elm === null) return false;
  return (
    gfxGroupCompatibleSymbol in elm && elm[gfxGroupCompatibleSymbol] === true
  );
};

/**
 * GfxGroupCompatibleElement is a model that can contain other models.
 * It just like a group that in common graphic software.
 */
export interface GfxGroupCompatibleInterface extends GfxCompatibleInterface {
  [gfxGroupCompatibleSymbol]: true;

  /**
   * All child ids of this container.
   */
  childIds: string[];

  /**
   * All child element models of this container.
   * Note that the `childElements` may not contains all the children in `childIds`,
   * because some children may not be loaded.
   */
  childElements: GfxModel[];

  descendantElements: GfxModel[];

  addChild(element: GfxCompatibleInterface): void;
  removeChild(element: GfxCompatibleInterface): void;
  hasChild(element: GfxCompatibleInterface): boolean;

  hasDescendant(element: GfxCompatibleInterface): boolean;
}

/**
 * The options for the hit testing of a point.
 */
export interface PointTestOptions {
  /**
   * The threshold of the hit test. The unit is pixel.
   */
  hitThreshold?: number;

  /**
   * If true, the element bound will be used for the hit testing.
   * By default, the response bound will be used.
   */
  useElementBound?: boolean;

  /**
   * The padding of the response area for each element when do the hit testing. The unit is pixel.
   * The first value is the padding for the x-axis, and the second value is the padding for the y-axis.
   */
  responsePadding?: [number, number];

  /**
   * If true, the transparent area of the element will be ignored during the point inclusion test.
   * Otherwise, the transparent area will be considered as filled area.
   *
   * Default is true.
   */
  ignoreTransparent?: boolean;

  /**
   * The zoom level of current view when do the hit testing.
   */
  zoom?: number;
}
