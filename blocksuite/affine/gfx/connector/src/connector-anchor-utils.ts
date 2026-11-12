import {
  DRAWIO_STENCIL_SHAPE_MAP,
  getStencilShapeData,
} from '@blocksuite/affine-gfx-shape';
import {
  type BrushElementModel,
  ConnectorElementModel,
  type GroupElementModel,
  ShapeType,
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

const buildEdgeLocations = (corners: IVec[], between = 3): IVec[] => {
  const locations: IVec[] = [];
  const count = corners.length;

  for (let i = 0; i < count; i += 1) {
    const start = corners[i];
    const end = corners[(i + 1) % count];
    locations.push([...start]);

    for (let j = 1; j <= between; j += 1) {
      const t = j / (between + 1);
      locations.push([
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
      ]);
    }
  }

  return locations;
};

const buildEllipseLocations = (stepDegrees = 22.5): IVec[] => {
  const locations: IVec[] = [];
  for (let angle = 0; angle < 360; angle += stepDegrees) {
    const rad = toRadian(angle);
    locations.push([0.5 + 0.5 * Math.cos(rad), 0.5 + 0.5 * Math.sin(rad)]);
  }
  return locations;
};

export const ConnectorEndpointLocationsOnRectangle: IVec[] = [
  [0.25, 0],
  [0.5, 0],
  [0.75, 0],
  [1, 0],
  [1, 0.25],
  [1, 0.5],
  [1, 0.75],
  [1, 1],
  [0.75, 1],
  [0.5, 1],
  [0.25, 1],
  [0, 1],
  [0, 0.75],
  [0, 0.5],
  [0, 0.25],
  [0, 0],
];

export const ConnectorEndpointLocationsOnDiamond: IVec[] = buildEdgeLocations([
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
]);

export const ConnectorEndpointLocationsOnEllipse: IVec[] =
  buildEllipseLocations();

export const ConnectorEndpointLocationsOnTriangleRight: IVec[] =
  buildEdgeLocations([
    [0, 0],
    [1, 0.5],
    [0, 1],
  ]);

export const ConnectorEndpointLocationsOnHexagon: IVec[] = buildEdgeLocations(
  [
    [0.25, 0],
    [0.75, 0],
    [1, 0.5],
    [0.75, 1],
    [0.25, 1],
    [0, 0.5],
  ],
  1
);

export const ConnectorEndpointLocationsOnParallelogram: IVec[] =
  buildEdgeLocations([
    [0.2, 0],
    [1, 0],
    [0.8, 1],
    [0, 1],
  ]);

export const ConnectorEndpointLocationsOnTrapezoid: IVec[] = buildEdgeLocations(
  [
    [0.2, 0],
    [0.8, 0],
    [1, 1],
    [0, 1],
  ]
);

export const ConnectorEndpointLocationsOnStep: IVec[] = buildEdgeLocations([
  [0, 0],
  [0.8, 0],
  [1, 0.5],
  [0.8, 1],
  [1, 1],
  [0, 1],
  [0.2, 0.5],
]);

export const ConnectorEndpointLocationsOnCylinder: IVec[] = buildEdgeLocations([
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]);

export const ConnectorEndpointLocationsOnCloud: IVec[] = [
  [0.25, 0.25],
  [0.16, 0.5],
  [0.31, 0.8],
  [0.8, 0.8],
  [0.875, 0.5],
  [0.625, 0.2],
];

export const ConnectorEndpointLocationsOnDocument: IVec[] = buildEdgeLocations([
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]);

export const ConnectorEndpointLocationsOnNote: IVec[] = buildEdgeLocations([
  [0, 0],
  [0.8, 0],
  [1, 0.2],
  [1, 1],
  [0, 1],
]);

export const ConnectorEndpointLocationsOnCube: IVec[] = buildEdgeLocations(
  [
    [0.2, 0],
    [1, 0],
    [1, 0.8],
    [0.8, 1],
    [0, 1],
    [0, 0.2],
  ],
  1
);

export const ConnectorEndpointLocationsOnCallout: IVec[] = buildEdgeLocations([
  [0, 0],
  [1, 0],
  [1, 0.75],
  [0.6, 0.75],
  [0.5, 1],
  [0.4, 0.75],
  [0, 0.75],
]);

export const ConnectorEndpointLocationsOnActor: IVec[] = buildEdgeLocations([
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]);

export const ConnectorEndpointLocationsOnDataStorage: IVec[] =
  ConnectorEndpointLocationsOnRectangle;

export const ConnectorEndpointLocationsOnTape: IVec[] = buildEdgeLocations(
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ],
  3
);

export const ConnectorEndpointLocationsOnInternalStorage: IVec[] =
  buildEdgeLocations([
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]);

export const ConnectorEndpointLocationsOnLogicAnd: IVec[] = buildEdgeLocations([
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]);

export const ConnectorEndpointLocationsOnLogicOr: IVec[] = buildEdgeLocations([
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]);

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

type ConnectionLocationResult = {
  locations: IVec[];
  fromStencil: boolean;
};

const mergeLocations = (locations: IVec[], extras: IVec[]): IVec[] => {
  const merged = [...locations, ...extras];
  const seen = new Set<string>();
  return merged.filter(([x, y]) => {
    const key = `${x.toFixed(4)}:${y.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const addStencilExtras = (shapeType: ShapeType, locations: IVec[]): IVec[] => {
  const rectangularEdgePoints: IVec[] = [
    [0.25, 0],
    [0.5, 0],
    [0.75, 0],
    [0.25, 1],
    [0.5, 1],
    [0.75, 1],
    [0, 0.25],
    [0, 0.5],
    [0, 0.75],
    [1, 0.25],
    [1, 0.5],
    [1, 0.75],
  ];
  switch (shapeType) {
    case ShapeType.Document:
      return mergeLocations(locations, [
        [0.25, 0],
        [0.75, 0],
        [0, 0.25],
        [0, 0.75],
        [1, 0.25],
        [1, 0.75],
      ]);
    case ShapeType.Cylinder:
      return mergeLocations(locations, [
        [0.25, 0],
        [0.75, 0],
        [0.25, 1],
        [0.75, 1],
        [0, 0.33],
        [0, 0.66],
        [1, 0.33],
        [1, 0.66],
      ]);
    case ShapeType.DataStorage:
    case ShapeType.InternalStorage:
      return mergeLocations(locations, rectangularEdgePoints);
    case ShapeType.Tape:
      return mergeLocations(locations, [
        [0.25, 0.09],
        [0.75, 0.09],
        [0.25, 0.91],
        [0.75, 0.91],
        [0, 0.25],
        [0, 0.75],
        [1, 0.25],
        [1, 0.75],
      ]);
    default:
      return locations;
  }
};

const getStencilConstraintLocations = (
  ele: GfxModel,
  shapeType: ShapeType
): ConnectionLocationResult | null => {
  if (shapeType === ShapeType.DataStorage || shapeType === ShapeType.Tape) {
    return null;
  }
  const name =
    shapeType === ShapeType.DrawioStencil
      ? ((ele as { stencilName?: string }).stencilName ?? null)
      : DRAWIO_STENCIL_SHAPE_MAP[shapeType as ShapeType];
  if (!name) return null;
  const stencil = getStencilShapeData(name);
  if (!stencil || stencil.constraints.length === 0) return null;
  const locations: IVec[] = stencil.constraints.map(
    constraint => [constraint.x, constraint.y] as IVec
  );
  return {
    locations: addStencilExtras(shapeType as ShapeType, locations),
    fromStencil: true,
  };
};

const buildCubeLocations = (bound: Bound): IVec[] => {
  const { w, h } = bound;
  const isoAngle = (15 * Math.PI) / 200;
  const isoH = Math.min(w * Math.tan(isoAngle), h * 0.5);
  const t = isoH / h;
  const corners: IVec[] = [
    [0.5, 0],
    [1, t],
    [1, 1 - t],
    [0.5, 1],
    [0, 1 - t],
    [0, t],
  ];

  const locations: IVec[] = [];
  for (let i = 0; i < corners.length; i += 1) {
    const start = corners[i];
    const end = corners[(i + 1) % corners.length];
    locations.push(start);
    locations.push([(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]);
  }
  return locations;
};

const getCustomLocations = (
  ele: GfxModel,
  bound: Bound
): ConnectionLocationResult | null => {
  if (!('shapeType' in ele)) return null;
  const shapeType = (ele as { shapeType: ShapeType }).shapeType;
  switch (shapeType) {
    case ShapeType.Cube:
      return { locations: buildCubeLocations(bound), fromStencil: true };
    case ShapeType.DataStorage:
    case ShapeType.Tape:
    case ShapeType.Document:
      return {
        locations: ConnectorEndpointLocationsOnRectangle,
        fromStencil: true,
      };
    default:
      return null;
  }
};

export function getConnectionLocationsForElement(
  ele: GfxModel
): ConnectionLocationResult {
  if ('shapeType' in ele) {
    const shapeType = (ele as { shapeType: ShapeType }).shapeType;
    const stencilLocations = getStencilConstraintLocations(ele, shapeType);
    if (stencilLocations) return stencilLocations;

    switch (shapeType) {
      case ShapeType.Rect:
        return {
          locations: ConnectorEndpointLocationsOnRectangle,
          fromStencil: false,
        };
      case ShapeType.Triangle:
        return {
          locations: ConnectorEndpointLocationsOnTriangle,
          fromStencil: false,
        };
      case ShapeType.Diamond:
        return {
          locations: ConnectorEndpointLocationsOnDiamond,
          fromStencil: false,
        };
      case ShapeType.Ellipse:
        return {
          locations: ConnectorEndpointLocationsOnEllipse,
          fromStencil: false,
        };
      case ShapeType.TriangleRight:
        return {
          locations: ConnectorEndpointLocationsOnTriangleRight,
          fromStencil: false,
        };
      case ShapeType.Hexagon:
        return {
          locations: ConnectorEndpointLocationsOnHexagon,
          fromStencil: false,
        };
      case ShapeType.Parallelogram:
        return {
          locations: ConnectorEndpointLocationsOnParallelogram,
          fromStencil: false,
        };
      case ShapeType.Trapezoid:
        return {
          locations: ConnectorEndpointLocationsOnTrapezoid,
          fromStencil: false,
        };
      case ShapeType.Step:
        return {
          locations: ConnectorEndpointLocationsOnStep,
          fromStencil: false,
        };
      case ShapeType.Cylinder:
        return {
          locations: ConnectorEndpointLocationsOnCylinder,
          fromStencil: false,
        };
      case ShapeType.Cloud:
        return {
          locations: ConnectorEndpointLocationsOnCloud,
          fromStencil: false,
        };
      case ShapeType.Document:
        return {
          locations: ConnectorEndpointLocationsOnDocument,
          fromStencil: false,
        };
      case ShapeType.Note:
        return {
          locations: ConnectorEndpointLocationsOnNote,
          fromStencil: false,
        };
      case ShapeType.Cube:
        return {
          locations: ConnectorEndpointLocationsOnCube,
          fromStencil: false,
        };
      case ShapeType.Callout:
        return {
          locations: ConnectorEndpointLocationsOnCallout,
          fromStencil: false,
        };
      case ShapeType.Actor:
        return {
          locations: ConnectorEndpointLocationsOnActor,
          fromStencil: false,
        };
      case ShapeType.DataStorage:
        return {
          locations: ConnectorEndpointLocationsOnDataStorage,
          fromStencil: false,
        };
      case ShapeType.Tape:
        return {
          locations: ConnectorEndpointLocationsOnTape,
          fromStencil: false,
        };
      case ShapeType.InternalStorage:
        return {
          locations: ConnectorEndpointLocationsOnInternalStorage,
          fromStencil: false,
        };
      case ShapeType.LogicAnd:
        return {
          locations: ConnectorEndpointLocationsOnLogicAnd,
          fromStencil: false,
        };
      case ShapeType.LogicOr:
        return {
          locations: ConnectorEndpointLocationsOnLogicOr,
          fromStencil: false,
        };
      default:
        return { locations: ConnectorEndpointLocations, fromStencil: false };
    }
  }

  return { locations: ConnectorEndpointLocations, fromStencil: false };
}

export function getAnchors(ele: GfxModel) {
  const bound = Bound.deserialize(ele.xywh);
  const anchors: { point: PointLocation; coord: IVec }[] = [];
  const rotate = ele.rotate;
  const custom = getCustomLocations(ele, bound);
  const { locations, fromStencil } =
    custom ?? getConnectionLocationsForElement(ele);
  const flipX = 'flipX' in ele && Boolean((ele as { flipX?: boolean }).flipX);
  const flipY = 'flipY' in ele && Boolean((ele as { flipY?: boolean }).flipY);

  locations.forEach(location => {
    const absPoint: IVec = [
      bound.x + location[0] * bound.w,
      bound.y + location[1] * bound.h,
    ];

    const rotatedPoint = getPointFromBoundsWithRotation(
      { ...bound, rotate },
      absPoint
    );

    if (fromStencil) {
      anchors.push({
        point: PointLocation.fromVec(rotatedPoint),
        coord: location,
      });
      return;
    }

    const rst = ele.getLineIntersections(bound.center, rotatedPoint);
    if (!rst) {
      anchors.push({
        point: PointLocation.fromVec(rotatedPoint),
        coord: location,
      });
      return;
    }

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

function closestPoint(
  points: PointLocation[],
  point: IVec
): PointLocation | null {
  if (points.length === 0) return null;
  const rst = points.map(p => ({ p, d: Vec.dist(p, point) }));
  rst.sort((a, b) => a.d - b.d);
  return rst[0].p;
}
