import {
  type BrushElementModel,
  ConnectorElementModel,
  type GroupElementModel,
} from '@blocksuite/affine-model';
import type { IBound, IVec, PointLocation } from '@blocksuite/global/gfx';
import {
  Bound,
  getPointFromBoundsWithRotation,
  isVecZero,
  toRadian,
  Vec,
} from '@blocksuite/global/gfx';
import type { GfxLocalElementModel, GfxModel } from '@blocksuite/std/gfx';

/**
 * Anchor/location helpers extracted from connector-manager.ts.
 *
 * Why this file exists:
 * - `connector-manager.ts` was a recurring rebase hotspot across pr/05-pr/09.
 * - Moving stable anchor math into a focused module reduces conflict surface.
 * - `connector-manager.ts` re-exports these APIs to keep import paths stable.
 */
export type Connectable = Exclude<
  GfxModel,
  ConnectorElementModel | BrushElementModel | GroupElementModel
>;

export const ConnectorEndpointLocations: IVec[] = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
];

export const ConnectorEndpointLocationsOnTriangle: IVec[] = [
  [0.5, 0],
  [0.75, 0.5],
  [0.5, 1],
  [0.25, 0.5],
];

export function isConnectorWithLabel(model: GfxModel | GfxLocalElementModel) {
  return model instanceof ConnectorElementModel && model.hasLabel();
}

export function calculateNearestLocation(
  point: IVec,
  bounds: IBound,
  locations = ConnectorEndpointLocations,
  shortestDistance = Number.POSITIVE_INFINITY
) {
  // Convert normalized anchor locations to absolute points and choose nearest.
  const { x, y, w, h } = bounds;
  return locations
    .map<IVec>(offset => [x + offset[0] * w, y + offset[1] * h])
    .map(point => getPointFromBoundsWithRotation(bounds, point))
    .reduce(
      (prev, curr, index) => {
        const d = Vec.dist(point, curr);
        if (d < shortestDistance) {
          const location = locations[index];
          shortestDistance = d;
          prev[0] = location[0];
          prev[1] = location[1];
        }
        return prev;
      },
      [...locations[0]]
    );
}

export function getAnchors(ele: GfxModel) {
  // Sample rays in the four cardinal directions and intersect with shape edges
  // to obtain connector anchors in element-relative coordinates.
  const bound = Bound.deserialize(ele.xywh);
  const offset = 10;
  const anchors: { point: PointLocation; coord: IVec }[] = [];
  const rotate = ele.rotate;

  (
    [
      [bound.center[0], bound.y - offset],
      [bound.center[0], bound.maxY + offset],
      [bound.x - offset, bound.center[1]],
      [bound.maxX + offset, bound.center[1]],
    ] satisfies IVec[]
  )
    .map(vec => getPointFromBoundsWithRotation({ ...bound, rotate }, vec))
    .forEach(vec => {
      const rst = ele.getLineIntersections(bound.center, vec);
      if (!rst) return;

      const originPoint = getPointFromBoundsWithRotation(
        { ...bound, rotate: -rotate },
        rst[0]
      );
      anchors.push({ point: rst[0], coord: bound.toRelative(originPoint) });
    });

  return anchors;
}

export function getConnectableRelativePosition(
  connectable: GfxModel,
  position: IVec
) {
  // Return a PointLocation enriched with tangent information for canonical
  // anchor positions so connector direction/orientation is consistent.
  const location = connectable.getRelativePointLocation(position);
  if (isVecZero(Vec.sub(position, [0, 0.5])))
    location.tangent = Vec.rot([0, -1], toRadian(connectable.rotate));
  else if (isVecZero(Vec.sub(position, [1, 0.5])))
    location.tangent = Vec.rot([0, 1], toRadian(connectable.rotate));
  else if (isVecZero(Vec.sub(position, [0.5, 0])))
    location.tangent = Vec.rot([1, 0], toRadian(connectable.rotate));
  else if (isVecZero(Vec.sub(position, [0.5, 1])))
    location.tangent = Vec.rot([-1, 0], toRadian(connectable.rotate));
  return location;
}

export function getNearestConnectableAnchor(ele: Connectable, point: IVec) {
  // Convenience selector used by path generation logic.
  const anchors = getAnchors(ele);
  return closestPoint(
    anchors.map(a => a.point),
    point
  );
}

function closestPoint(
  points: PointLocation[],
  point: IVec
): PointLocation | null {
  if (points.length === 0) return null;
  const rst = points.map(p => ({ p, d: Vec.dist(p, point) }));
  rst.sort((a, b) => a.d - b.d);
  return rst[0].p;
}
