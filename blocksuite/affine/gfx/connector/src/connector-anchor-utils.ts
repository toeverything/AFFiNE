import {
  type BrushElementModel,
  ConnectorElementModel,
  type GroupElementModel,
} from '@blocksuite/affine-model';
import type { IBound, IVec } from '@blocksuite/global/gfx';
import {
  Bound,
  getPointFromBoundsWithRotation,
  isVecZero,
  PointLocation,
  toRadian,
  Vec,
} from '@blocksuite/global/gfx';
import type { GfxLocalElementModel, GfxModel } from '@blocksuite/std/gfx';

/**
 * Extracted anchor/location helpers from connector-manager.ts.
 *
 * Keeping this logic in its own module reduces repeated rebase conflicts in
 * connector-manager while preserving the existing API via re-exports.
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
  const bound = Bound.deserialize(ele.xywh);
  const offset = 10;
  const anchors: { point: PointLocation; coord: IVec }[] = [];
  const rotate = ele.rotate;
  const flipX = 'flipX' in ele && Boolean((ele as { flipX?: boolean }).flipX);
  const flipY = 'flipY' in ele && Boolean((ele as { flipY?: boolean }).flipY);

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

  if (!flipX && !flipY) {
    return anchors;
  }

  const flipMatrix = (() => {
    const cx = bound.x + bound.w / 2;
    const cy = bound.y + bound.h / 2;
    return new DOMMatrix()
      .translateSelf(cx, cy)
      .scaleSelf(flipX ? -1 : 1, flipY ? -1 : 1)
      .rotateSelf(rotate)
      .translateSelf(-cx, -cy);
  })();

  return anchors.map(anchor => {
    const absPoint: IVec = [
      bound.x + anchor.coord[0] * bound.w,
      bound.y + anchor.coord[1] * bound.h,
    ];
    const { x, y } = new DOMPoint(absPoint[0], absPoint[1]).matrixTransform(
      flipMatrix
    );
    return {
      point: PointLocation.fromVec([x, y]),
      coord: anchor.coord,
    };
  });
}

export function getConnectableRelativePosition(
  connectable: GfxModel,
  position: IVec
) {
  const flipX =
    'flipX' in connectable &&
    Boolean((connectable as { flipX?: boolean }).flipX);
  const flipY =
    'flipY' in connectable &&
    Boolean((connectable as { flipY?: boolean }).flipY);
  const flippedPosition: IVec = [
    flipX ? 1 - position[0] : position[0],
    flipY ? 1 - position[1] : position[1],
  ];

  if (flipX || flipY) {
    const anchors = getAnchors(connectable);
    const matched = anchors.find(
      anchor =>
        Math.abs(anchor.coord[0] - position[0]) < 1e-6 &&
        Math.abs(anchor.coord[1] - position[1]) < 1e-6
    );
    if (matched) {
      const location = connectable.getRelativePointLocation(flippedPosition);
      location[0] = matched.point[0];
      location[1] = matched.point[1];
      return location;
    }
  }

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
  const anchors = getAnchors(ele);
  return closestPoint(
    anchors.map(a => a.point),
    point
  );
}

function closestPoint(points: PointLocation[], point: IVec): PointLocation | null {
  if (points.length === 0) return null;
  const rst = points.map(p => ({ p, d: Vec.dist(p, point) }));
  rst.sort((a, b) => a.d - b.d);
  return rst[0].p;
}
