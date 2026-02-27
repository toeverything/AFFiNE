import { AStarRunner, Overlay } from '@blocksuite/affine-block-surface';
import {
  DRAWIO_STENCIL_SHAPE_MAP,
  getStencilShapeData,
} from '@blocksuite/affine-gfx-shape';
import {
  type BrushElementModel,
  type Connection,
  ConnectorElementModel,
  ConnectorMode,
  GroupElementModel,
  type LocalConnectorElementModel,
} from '@blocksuite/affine-model';
import { CONTAINER_TITLE_SIZE, ShapeType } from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { BlockSuiteError } from '@blocksuite/global/exceptions';
import type { IBound, IVec, IVec3 } from '@blocksuite/global/gfx';
import {
  almostEqual,
  Bound,
  getBezierCurveBoundingBox,
  getBezierParameters,
  getBoundFromPoints,
  getBoundWithRotation,
  getPointFromBoundsWithRotation,
  isOverlap,
  isVecZero,
  lineIntersects,
  PI2,
  PointLocation,
  sign,
  toRadian,
  Vec,
} from '@blocksuite/global/gfx';
import { assertType } from '@blocksuite/global/utils';
import type {
  GfxController,
  GfxLocalElementModel,
  GfxModel,
} from '@blocksuite/std/gfx';
import { effect } from '@preact/signals-core';
import last from 'lodash-es/last';

export type Connectable = Exclude<
  GfxModel,
  ConnectorElementModel | BrushElementModel | GroupElementModel
>;

export type OrthogonalConnectorInput = {
  startBound: Bound | null;
  endBound: Bound | null;
  startPoint: PointLocation;
  endPoint: PointLocation;
};

export const ConnectorEndpointLocations: IVec[] = [
  // At top
  [0.5, 0],
  // At right
  [1, 0.5],
  // At bottom
  [0.5, 1],
  // At left
  [0, 0.5],
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

export const ConnectorEndpointLocationsOnTriangle: IVec[] = buildEdgeLocations([
  [0.5, 0],
  [1, 1],
  [0, 1],
]);

// Extended connection points for rectangle (16 points total)
export const ConnectorEndpointLocationsOnRectangle: IVec[] = [
  // Top edge: left quarter, center, right quarter
  [0.25, 0],
  [0.5, 0],
  [0.75, 0],
  // Top-right corner
  [1, 0],
  // Right edge: top quarter, center, bottom quarter
  [1, 0.25],
  [1, 0.5],
  [1, 0.75],
  // Bottom-right corner
  [1, 1],
  // Bottom edge: right quarter, center, left quarter
  [0.75, 1],
  [0.5, 1],
  [0.25, 1],
  // Bottom-left corner
  [0, 1],
  // Left edge: bottom quarter, center, top quarter
  [0, 0.75],
  [0, 0.5],
  [0, 0.25],
  // Top-left corner
  [0, 0],
];

// Extended connection points for diamond (8 points total)
export const ConnectorEndpointLocationsOnDiamond: IVec[] = buildEdgeLocations([
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
]);

// Extended connection points for ellipse (8 points total)
// Points calculated using trigonometry to sit on the actual ellipse curve
// Formula: x = 0.5 + 0.5 * cos(angle), y = 0.5 + 0.5 * sin(angle)
const buildEllipseLocations = (stepDegrees = 22.5): IVec[] => {
  const locations: IVec[] = [];
  for (let angle = 0; angle < 360; angle += stepDegrees) {
    const rad = toRadian(angle);
    locations.push([0.5 + 0.5 * Math.cos(rad), 0.5 + 0.5 * Math.sin(rad)]);
  }
  return locations;
};

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
  // six lobe meeting points
  [0.25, 0.25],
  [0.16, 0.5],
  [0.31, 0.8],
  [0.8, 0.8],
  [0.875, 0.5],
  [0.625, 0.2],
  // extra side-center anchors
  [0, 0.5],
  [1, 0.5],
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

function rBound(ele: GfxModel, anti = false): IBound {
  const bound = Bound.deserialize(ele.xywh);
  return { ...bound, rotate: anti ? -ele.rotate : ele.rotate };
}

export function isConnectorAndBindingsAllSelected(
  connector: ConnectorElementModel | LocalConnectorElementModel,
  selected: GfxModel[]
) {
  const connectorSelected = selected.find(s => s.id === connector.id);
  if (!connectorSelected) {
    return false;
  }
  const { source, target } = connector;
  const startSelected = selected.find(s => s.id === source?.id);
  const endSelected = selected.find(s => s.id === target?.id);
  if (!source.id && !target.id) {
    return true;
  }
  if (!source.id && endSelected) {
    return true;
  }
  if (!target.id && startSelected) {
    return true;
  }
  if (startSelected && endSelected) {
    return true;
  }
  return false;
}

/**
 * Get connection point locations for a given element based on its shape type
 */
type ConnectionLocationResult = {
  locations: IVec[];
  fromStencil: boolean;
};

const getStencilConstraintLocations = (
  shapeType: string,
  stencilName?: string
): ConnectionLocationResult | null => {
  if (
    shapeType === ShapeType.DataStorage ||
    shapeType === ShapeType.Tape ||
    shapeType === ShapeType.Document
  ) {
    return null;
  }
  const name =
    shapeType === ShapeType.DrawioStencil
      ? stencilName
      : DRAWIO_STENCIL_SHAPE_MAP[shapeType as ShapeType];
  if (!name) return null;
  const stencil = getStencilShapeData(name);
  if (!stencil || stencil.constraints.length === 0) return null;
  const locations: IVec[] = stencil.constraints.map(
    constraint => [constraint.x, constraint.y] as IVec
  );
  const enhancedLocations = addStencilExtras(shapeType as ShapeType, locations);
  return {
    locations: enhancedLocations,
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

const buildRectangularLocations = (): IVec[] =>
  ConnectorEndpointLocationsOnRectangle;

const buildContainerTitleLocations = (
  bound: Bound,
  axis: 'vertical' | 'horizontal'
): IVec[] => {
  const size = axis === 'vertical' ? bound.h : bound.w;
  const titleSize = Math.min(CONTAINER_TITLE_SIZE, size);
  const contentSize = Math.max(size - titleSize, 0);
  const titleMid = size > 0 ? titleSize / 2 / size : 0.5;
  const contentMid = size > 0 ? (titleSize + contentSize / 2) / size : 0.5;

  if (axis === 'vertical') {
    return [
      [0, titleMid],
      [1, titleMid],
      [0, contentMid],
      [1, contentMid],
      [0.5, 0],
      [0.5, 1],
    ];
  }

  return [
    [titleMid, 0],
    [titleMid, 1],
    [contentMid, 0],
    [contentMid, 1],
    [0, 0.5],
    [1, 0.5],
  ];
};

const getCustomLocations = (
  ele: GfxModel,
  bound: Bound
): ConnectionLocationResult | null => {
  if (!('shapeType' in ele)) return null;
  const shapeType = (ele as any).shapeType as ShapeType;
  switch (shapeType) {
    case ShapeType.MindmapBranch:
      return {
        locations: [
          [0, 0.5],
          [1, 0.5],
        ],
        fromStencil: false,
      };
    case ShapeType.Cube:
      return { locations: buildCubeLocations(bound), fromStencil: false };
    case ShapeType.DataStorage:
    case ShapeType.Tape:
    case ShapeType.Document:
      return { locations: buildRectangularLocations(), fromStencil: true };
    case ShapeType.VerticalContainer:
      return {
        locations: mergeLocations(
          ConnectorEndpointLocationsOnRectangle,
          buildContainerTitleLocations(bound, 'vertical')
        ),
        fromStencil: false,
      };
    case ShapeType.HorizontalContainer:
      return {
        locations: mergeLocations(
          ConnectorEndpointLocationsOnRectangle,
          buildContainerTitleLocations(bound, 'horizontal')
        ),
        fromStencil: false,
      };
    default:
      return null;
  }
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

export function getConnectionLocationsForElement(
  ele: GfxModel
): ConnectionLocationResult {
  // Check if element is a ShapeElementModel and get shape-specific locations
  if ('shapeType' in ele) {
    const shapeType = (ele as any).shapeType;
    const stencilLocations = getStencilConstraintLocations(
      shapeType,
      (ele as any).stencilName
    );
    if (stencilLocations) return stencilLocations;
    switch (shapeType) {
      case 'rect':
        return {
          locations: ConnectorEndpointLocationsOnRectangle,
          fromStencil: false,
        };
      case 'triangle':
        return {
          locations: ConnectorEndpointLocationsOnTriangle,
          fromStencil: false,
        };
      case 'diamond':
        return {
          locations: ConnectorEndpointLocationsOnDiamond,
          fromStencil: false,
        };
      case 'ellipse':
        return {
          locations: ConnectorEndpointLocationsOnEllipse,
          fromStencil: false,
        };
      case 'triangleRight':
        return {
          locations: ConnectorEndpointLocationsOnTriangleRight,
          fromStencil: false,
        };
      case 'hexagon':
        return {
          locations: ConnectorEndpointLocationsOnHexagon,
          fromStencil: false,
        };
      case 'parallelogram':
        return {
          locations: ConnectorEndpointLocationsOnParallelogram,
          fromStencil: false,
        };
      case 'trapezoid':
        return {
          locations: ConnectorEndpointLocationsOnTrapezoid,
          fromStencil: false,
        };
      case 'step':
        return {
          locations: ConnectorEndpointLocationsOnStep,
          fromStencil: false,
        };
      case 'cylinder':
        return {
          locations: ConnectorEndpointLocationsOnCylinder,
          fromStencil: false,
        };
      case 'cloud':
        return {
          locations: ConnectorEndpointLocationsOnCloud,
          fromStencil: false,
        };
      case 'document':
        return {
          locations: ConnectorEndpointLocationsOnDocument,
          fromStencil: false,
        };
      case 'note':
        return {
          locations: ConnectorEndpointLocationsOnNote,
          fromStencil: false,
        };
      case 'cube':
        return {
          locations: ConnectorEndpointLocationsOnCube,
          fromStencil: false,
        };
      case 'callout':
        return {
          locations: ConnectorEndpointLocationsOnCallout,
          fromStencil: false,
        };
      case 'actor':
        return {
          locations: ConnectorEndpointLocationsOnActor,
          fromStencil: false,
        };
      case 'dataStorage':
        return {
          locations: ConnectorEndpointLocationsOnDataStorage,
          fromStencil: false,
        };
      case 'tape':
        return {
          locations: ConnectorEndpointLocationsOnTape,
          fromStencil: false,
        };
      case 'internalStorage':
        return {
          locations: ConnectorEndpointLocationsOnInternalStorage,
          fromStencil: false,
        };
      case 'logicAnd':
        return {
          locations: ConnectorEndpointLocationsOnLogicAnd,
          fromStencil: false,
        };
      case 'logicOr':
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

  // For each connection location (relative coordinates), calculate the actual point
  locations.forEach(location => {
    const flipX = 'flipX' in ele && Boolean((ele as { flipX?: boolean }).flipX);
    const flipY = 'flipY' in ele && Boolean((ele as { flipY?: boolean }).flipY);
    const coordToStore = location;
    // Convert relative location to absolute position
    const absPoint: IVec = [
      bound.x + location[0] * bound.w,
      bound.y + location[1] * bound.h,
    ];

    // Apply rotation if needed
    const rotatedPoint = getPointFromBoundsWithRotation(
      { ...bound, rotate },
      absPoint
    );
    const flippedPoint =
      flipX || flipY
        ? (() => {
            const cx = bound.x + bound.w / 2;
            const cy = bound.y + bound.h / 2;
            const matrix = new DOMMatrix()
              .translateSelf(cx, cy)
              .rotateSelf(rotate ?? 0)
              .scaleSelf(flipX ? -1 : 1, flipY ? -1 : 1)
              .rotateSelf(-(rotate ?? 0))
              .translateSelf(-cx, -cy);
            const { x, y } = new DOMPoint(
              rotatedPoint[0],
              rotatedPoint[1]
            ).matrixTransform(matrix);
            return [x, y] as IVec;
          })()
        : rotatedPoint;

    if (fromStencil) {
      anchors.push({
        point: PointLocation.fromVec(flippedPoint),
        coord: coordToStore,
      });
      return;
    }

    // Get the intersection point with the shape's edge
    const rst = ele.getLineIntersections(bound.center, rotatedPoint);
    if (!rst) {
      // If no intersection, use the calculated point directly
      anchors.push({
        point: PointLocation.fromVec(flippedPoint),
        coord: coordToStore,
      });
      return;
    }

    const originPoint = getPointFromBoundsWithRotation(
      { ...bound, rotate: -rotate },
      rst[0]
    );
    const relativeToStore = bound.toRelative(originPoint);
    const intersectionPoint =
      flipX || flipY
        ? (() => {
            const cx = bound.x + bound.w / 2;
            const cy = bound.y + bound.h / 2;
            const matrix = new DOMMatrix()
              .translateSelf(cx, cy)
              .rotateSelf(rotate ?? 0)
              .scaleSelf(flipX ? -1 : 1, flipY ? -1 : 1)
              .rotateSelf(-(rotate ?? 0))
              .translateSelf(-cx, -cy);
            const { x, y } = new DOMPoint(rst[0][0], rst[0][1]).matrixTransform(
              matrix
            );
            return [x, y] as IVec;
          })()
        : rst[0];
    anchors.push({
      point: PointLocation.fromVec(intersectionPoint),
      coord: relativeToStore,
    });
  });

  return anchors;
}

function getConnectableRelativePosition(connectable: GfxModel, position: IVec) {
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
  const location = connectable.getRelativePointLocation(flippedPosition);

  if ('shapeType' in connectable && connectable.shapeType === ShapeType.Cloud) {
    const topOrBottomBand =
      almostEqual(flippedPosition[1], 0.2) ||
      almostEqual(flippedPosition[1], 0.25) ||
      almostEqual(flippedPosition[1], 0.8);
    // In connector routing slope calculation, a horizontal tangent means
    // vertical expansion and a vertical tangent means horizontal expansion.
    location.tangent = Vec.rot(
      topOrBottomBand ? [1, 0] : [0, -1],
      toRadian(connectable.rotate)
    );
    return location;
  }

  if (isVecZero(Vec.sub(flippedPosition, [0, 0.5])))
    location.tangent = Vec.rot([0, -1], toRadian(connectable.rotate));
  else if (isVecZero(Vec.sub(flippedPosition, [1, 0.5])))
    location.tangent = Vec.rot([0, 1], toRadian(connectable.rotate));
  else if (isVecZero(Vec.sub(flippedPosition, [0.5, 0])))
    location.tangent = Vec.rot([1, 0], toRadian(connectable.rotate));
  else if (isVecZero(Vec.sub(flippedPosition, [0.5, 1])))
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

function computePoints(
  startPoint: IVec,
  endPoint: IVec,
  nextStartPoint: IVec,
  lastEndPoint: IVec,
  startBound: Bound | null,
  endBound: Bound | null,
  expandStartBound: Bound | null,
  expandEndBound: Bound | null
): [IVec3[], IVec3, IVec3, IVec3, IVec3] {
  const startPointVec3 = downscalePrecision(startPoint);
  const endPointVec3 = downscalePrecision(endPoint);
  let nextStartPointVec3 = downscalePrecision(nextStartPoint);
  let lastEndPointVec3 = downscalePrecision(lastEndPoint);

  const result = getConnectablePoints(
    startPointVec3,
    endPointVec3,
    nextStartPointVec3,
    lastEndPointVec3,
    startBound,
    endBound,
    expandStartBound,
    expandEndBound
  );
  const points = result.points;
  nextStartPointVec3 = result.nextStartPoint;
  lastEndPointVec3 = result.lastEndPoint;
  const finalPoints = filterConnectablePoints(
    filterConnectablePoints(points, expandStartBound?.expand(-1) ?? null),
    expandEndBound?.expand(-1) ?? null
  );
  return [
    finalPoints,
    startPointVec3,
    endPointVec3,
    nextStartPointVec3,
    lastEndPointVec3,
  ];
}

function downscalePrecision(point: IVec | IVec3): IVec3 {
  return [
    Number(point[0].toFixed(2)),
    Number(point[1].toFixed(2)),
    point[2] ?? 0,
  ];
}

function filterConnectablePoints<T extends IVec3 | IVec>(
  points: T[],
  bound: Bound | null
): T[] {
  return points.filter(point => {
    if (!bound) return true;
    return !bound.isPointInBound([point[0], point[1]]);
  });
}

function pushWithPriority(points: number[][], vecs: IVec[], priority = 0) {
  points.push(...vecs.map(vec => [...vec, priority]));
}

function pushLineIntersectsToPoints(
  points: IVec3[],
  aLine: IVec[],
  bLine: IVec[],
  priority = 0
) {
  const rst = lineIntersects(aLine[0], aLine[1], bLine[0], bLine[1], true);
  if (rst) {
    pushWithPriority(points, [rst], priority);
  }
}

function pushOuterPoints(
  points: IVec3[],
  expandStartBound: Bound,
  expandEndBound: Bound,
  outerBound: Bound
) {
  if (expandStartBound && expandEndBound && outerBound) {
    pushWithPriority(points, outerBound.getVerticesAndMidpoints());
    pushWithPriority(points, [outerBound.center], 2);
    [
      expandStartBound.upperLine,
      expandStartBound.horizontalLine,
      expandStartBound.lowerLine,
      expandEndBound.upperLine,
      expandEndBound.horizontalLine,
      expandEndBound.lowerLine,
    ].forEach(line => {
      pushLineIntersectsToPoints(points, line, outerBound.leftLine, 0);
      pushLineIntersectsToPoints(points, line, outerBound.rightLine, 0);
    });
    [
      expandStartBound.leftLine,
      expandStartBound.verticalLine,
      expandStartBound.rightLine,
      expandEndBound.leftLine,
      expandEndBound.verticalLine,
      expandEndBound.rightLine,
    ].forEach(line => {
      pushLineIntersectsToPoints(points, line, outerBound.upperLine, 0);
      pushLineIntersectsToPoints(points, line, outerBound.lowerLine, 0);
    });
  }
}

function pushBoundMidPoint(
  points: IVec3[],
  bound1: Bound,
  bound2: Bound,
  expandBound1: Bound,
  expandBound2: Bound
) {
  if (bound1.maxX < bound2.x) {
    const midX = (bound1.maxX + bound2.x) / 2;
    [
      expandBound1.horizontalLine,
      expandBound2.horizontalLine,
      expandBound1.upperLine,
      expandBound1.lowerLine,
      expandBound2.upperLine,
      expandBound2.lowerLine,
    ].forEach((line, index) => {
      pushLineIntersectsToPoints(
        points,
        line,
        [
          [midX, 0],
          [midX, 1],
        ],
        index === 0 || index === 1 ? 6 : 3
      );
    });
  }
  if (bound1.maxY < bound2.y) {
    const midY = (bound1.maxY + bound2.y) / 2;
    [
      expandBound1.verticalLine,
      expandBound2.verticalLine,
      expandBound1.leftLine,
      expandBound1.rightLine,
      expandBound2.leftLine,
      expandBound2.rightLine,
    ].forEach((line, index) => {
      pushLineIntersectsToPoints(
        points,
        line,
        [
          [0, midY],
          [1, midY],
        ],
        index === 0 || index === 1 ? 6 : 3
      );
    });
  }
}

function pushGapMidPoint(
  points: IVec3[],
  point: IVec3,
  bound: Bound,
  bound2: Bound,
  expandBound: Bound,
  expandBound2: Bound
) {
  /** on top or on bottom */
  if (
    almostEqual(point[1], bound.y, 0.02) ||
    almostEqual(point[1], bound.maxY, 0.02)
  ) {
    const rst = [
      bound.upperLine,
      bound.lowerLine,
      bound2.upperLine,
      bound2.lowerLine,
    ]
      .map(line => {
        return lineIntersects(
          [point[0], point[1]],
          [point[0], point[1] + 1],
          line[0],
          line[1],
          true
        );
      })
      .filter(p => p !== null);
    rst.sort((a, b) => a[1] - b[1]);
    const midPoint = Vec.lrp(rst[1], rst[2], 0.5);
    pushWithPriority(points, [midPoint], 6);
    [
      expandBound.leftLine,
      expandBound.rightLine,
      expandBound2.leftLine,
      expandBound2.rightLine,
    ].forEach(line => {
      pushLineIntersectsToPoints(
        points,
        [midPoint, [midPoint[0] + 1, midPoint[1]]],
        line,
        0
      );
    });
  } else {
    const rst = [
      bound.leftLine,
      bound.rightLine,
      bound2.leftLine,
      bound2.rightLine,
    ]
      .map(line => {
        return lineIntersects(
          [point[0], point[1]],
          [point[0] + 1, point[1]],
          line[0],
          line[1],
          true
        );
      })
      .filter(p => p !== null);
    rst.sort((a, b) => a[0] - b[0]);
    const midPoint = Vec.lrp(rst[1], rst[2], 0.5);
    pushWithPriority(points, [midPoint], 6);
    [
      expandBound.upperLine,
      expandBound.lowerLine,
      expandBound2.upperLine,
      expandBound2.lowerLine,
    ].forEach(line => {
      pushLineIntersectsToPoints(
        points,
        [midPoint, [midPoint[0], midPoint[1] + 1]],
        line,
        0
      );
    });
  }
}

function removeDulicatePoints(points: IVec[] | IVec3[]) {
  points = points.map(downscalePrecision);
  points.sort((a, b) => a[0] - b[0]);
  assertType<IVec3[]>(points);
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i];
    const last = points[i - 1];
    if (almostEqual(cur[0], last[0], 0.02)) {
      cur[0] = last[0];
    }
  }
  points.sort((a, b) => a[1] - b[1]);
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i];
    const last = points[i - 1];
    if (almostEqual(cur[1], last[1], 0.02)) {
      cur[1] = last[1];
    }
  }
  points.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });
  for (let i = 1; i < points.length; i++) {
    const cur = points[i];
    const last = points[i - 1];
    if (
      almostEqual(cur[0], last[0], 0.02) &&
      almostEqual(cur[1], last[1], 0.02)
    ) {
      if (cur[2] <= last[2]) points.splice(i, 1);
      else points.splice(i - 1, 1);
      i--;
      continue;
    }
  }
  return points;
}

function getConnectablePoints(
  startPoint: IVec3,
  endPoint: IVec3,
  nextStartPoint: IVec3,
  lastEndPoint: IVec3,
  startBound: Bound | null,
  endBound: Bound | null,
  expandStartBound: Bound | null,
  expandEndBound: Bound | null
) {
  const lineBound = Bound.fromPoints([
    [startPoint[0], startPoint[1]],
    [endPoint[0], endPoint[1]],
  ]);
  const outerBound =
    expandStartBound &&
    expandEndBound &&
    expandStartBound.unite(expandEndBound);
  let points = [nextStartPoint, lastEndPoint];
  pushWithPriority(points, lineBound.getVerticesAndMidpoints());

  if (!startBound || !endBound) {
    pushWithPriority(points, [lineBound.center], 3);
  }
  if (outerBound) {
    pushOuterPoints(points, expandStartBound, expandEndBound, outerBound);
  }

  if (startBound && endBound && expandStartBound && expandEndBound) {
    pushGapMidPoint(
      points,
      startPoint,
      startBound,
      endBound,
      expandStartBound,
      expandEndBound
    );
    pushGapMidPoint(
      points,
      endPoint,
      endBound,
      startBound,
      expandEndBound,
      expandStartBound
    );
    pushBoundMidPoint(
      points,
      startBound,
      endBound,
      expandStartBound,
      expandEndBound
    );
    pushBoundMidPoint(
      points,
      endBound,
      startBound,
      expandEndBound,
      expandStartBound
    );
  }

  if (expandStartBound) {
    pushWithPriority(points, expandStartBound.getVerticesAndMidpoints());
    pushWithPriority(
      points,
      expandStartBound.include([lastEndPoint[0], lastEndPoint[1]]).points
    );
  }

  if (expandEndBound) {
    pushWithPriority(points, expandEndBound.getVerticesAndMidpoints());
    pushWithPriority(
      points,
      expandEndBound.include([nextStartPoint[0], nextStartPoint[1]]).points
    );
  }

  points = removeDulicatePoints(points);

  const sorted = points.map(point => point[0] + ',' + point[1]).sort();
  sorted.forEach((cur, index) => {
    if (index === 0) return;
    if (cur === sorted[index - 1]) {
      throw new Error('duplicate point');
    }
  });
  const startEnds = [nextStartPoint, lastEndPoint].map(point => {
    return points.find(
      item =>
        almostEqual(item[0], point[0], 0.02) &&
        almostEqual(item[1], point[1], 0.02)
    );
  });
  if (!startEnds[0] || !startEnds[1]) {
    throw new BlockSuiteError(
      BlockSuiteError.ErrorCode.ValueNotExists,
      'Failed to get start and end points when getting connectable points'
    );
  }
  return { points, nextStartPoint: startEnds[0], lastEndPoint: startEnds[1] };
}

function getDirectPath(startPoint: IVec, endPoint: IVec): IVec[] {
  if (
    almostEqual(startPoint[0], endPoint[0], 0.02) ||
    almostEqual(startPoint[1], endPoint[1], 0.02)
  ) {
    return [startPoint, endPoint];
  } else {
    const vec = Vec.sub(endPoint, startPoint);
    const mid: IVec = [startPoint[0], startPoint[1] + vec[1]];
    return [startPoint, mid, endPoint];
  }
}

function mergePath(points: IVec[] | IVec3[]) {
  if (points.length === 0) return [];
  const result: IVec[] = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i];
    const last = points[i - 1];
    const next = points[i + 1];
    if (
      almostEqual(last[0], cur[0], 0.02) &&
      almostEqual(cur[0], next[0], 0.02)
    )
      continue;
    if (
      almostEqual(last[1], cur[1], 0.02) &&
      almostEqual(cur[1], next[1], 0.02)
    )
      continue;
    result.push([cur[0], cur[1]]);
  }
  if (points.length !== 0) {
    result.push([points[points.length - 1][0], points[points.length - 1][1]]);
  }
  for (let i = 0; i < result.length - 1; i++) {
    const cur = result[i];
    const next = result[i + 1];
    const isAlmostEqual =
      almostEqual(cur[0], next[0], 0.02) || almostEqual(cur[1], next[1], 0.02);
    if (!isAlmostEqual) {
      console.warn('Expected equal points');
      console.warn(points);
      console.warn(result);
    }
  }
  return result;
}

function computeOffset(startBound: Bound | null, endBound: Bound | null) {
  const startOffset = [20, 20, 20, 20];
  const endOffset = [20, 20, 20, 20];
  if (!(startBound && endBound)) {
    return [startOffset, endOffset];
  }
  // left, top, right, bottom
  let overlap = isOverlap(startBound.upperLine, endBound.lowerLine, 0, false);
  let dist: number;
  if (overlap && startBound.upperLine[0][1] > endBound.lowerLine[0][1]) {
    dist = Vec.distanceToLineSegment(
      startBound.upperLine[0],
      startBound.upperLine[1],
      endBound.lowerLine[0],
      false
    );
    startOffset[1] = Math.max(Math.min(dist / 2, startOffset[1]), 0);
  }

  overlap = isOverlap(startBound.rightLine, endBound.leftLine, 1, false);
  if (overlap && startBound.rightLine[0][0] < endBound.leftLine[0][0]) {
    dist = Vec.distanceToLineSegment(
      startBound.rightLine[0],
      startBound.rightLine[1],
      endBound.leftLine[0],
      false
    );
    startOffset[2] = Math.max(Math.min(dist / 2, startOffset[2]), 0);
  }

  overlap = isOverlap(startBound.lowerLine, endBound.upperLine, 0, false);
  if (overlap && startBound.lowerLine[0][1] < endBound.upperLine[0][1]) {
    dist = Vec.distanceToLineSegment(
      startBound.lowerLine[0],
      startBound.lowerLine[1],
      endBound.upperLine[0],
      false
    );
    startOffset[3] = Math.max(Math.min(dist / 2, startOffset[3]), 0);
  }

  startOffset[0] = endOffset[2] =
    Math.min(startOffset[0], endOffset[2]) === 0
      ? 20
      : Math.min(startOffset[0], endOffset[2]);
  startOffset[1] = endOffset[3] =
    Math.min(startOffset[1], endOffset[3]) === 0
      ? 20
      : Math.min(startOffset[1], endOffset[3]);
  startOffset[2] = endOffset[0] =
    Math.min(startOffset[2], endOffset[0]) === 0
      ? 20
      : Math.min(startOffset[2], endOffset[0]);
  startOffset[3] = endOffset[1] =
    Math.min(startOffset[3], endOffset[1]) === 0
      ? 20
      : Math.min(startOffset[3], endOffset[1]);

  return [startOffset, endOffset];
}

function getNextPoint(
  bound: Bound,
  point: PointLocation,
  offsetX = 10,
  offsetY = 10,
  offsetW = 10,
  offsetH = 10
) {
  const result: IVec = [point[0], point[1]];
  if (almostEqual(bound.x, result[0])) result[0] -= offsetX;
  else if (almostEqual(bound.y, result[1])) result[1] -= offsetY;
  else if (almostEqual(bound.maxX, result[0])) result[0] += offsetW;
  else if (almostEqual(bound.maxY, result[1])) result[1] += offsetH;
  else {
    const direction = Vec.normalize(Vec.sub(result, bound.center));
    const xDirection = direction[0] > 0 ? 1 : -1;
    const yDirection = direction[1] > 0 ? 1 : -1;

    const slope =
      Math.abs(point.tangent[0]) < Math.abs(point.tangent[1]) ? 0 : 1;
    // if the slope is big, use the x direction
    if (slope === 0) {
      if (xDirection > 0) {
        const intersects = lineIntersects(
          bound.rightLine[0],
          bound.rightLine[1],
          result,
          [bound.maxX + 10, result[1]]
        );
        if (!intersects) {
          throw new BlockSuiteError(
            BlockSuiteError.ErrorCode.ValueNotExists,
            'Failed to get line intersections for getNextPoint'
          );
        }
        result[0] = intersects[0] + offsetX;
      } else {
        const intersects = lineIntersects(
          bound.leftLine[0],
          bound.leftLine[1],
          result,
          [bound.x - 10, result[1]]
        );
        if (!intersects) {
          throw new BlockSuiteError(
            BlockSuiteError.ErrorCode.ValueNotExists,
            'Failed to get line intersections for getNextPoint'
          );
        }
        result[0] = intersects[0] - offsetX;
      }
    } else {
      if (yDirection > 0) {
        const intersects = lineIntersects(
          bound.lowerLine[0],
          bound.lowerLine[1],
          result,
          [result[0], bound.maxY + 10]
        );
        if (!intersects) {
          throw new BlockSuiteError(
            BlockSuiteError.ErrorCode.ValueNotExists,
            'Failed to get line intersections for getNextPoint'
          );
        }
        result[1] = intersects[1] + offsetY;
      } else {
        const intersects = lineIntersects(
          bound.upperLine[0],
          bound.upperLine[1],
          result,
          [result[0], bound.y - 10]
        );
        if (!intersects) {
          throw new BlockSuiteError(
            BlockSuiteError.ErrorCode.ValueNotExists,
            'Failed to get line intersections for getNextPoint'
          );
        }
        result[1] = intersects[1] - offsetY;
      }
    }
  }
  return result;
}

function computeNextStartEndpoint(
  startPoint: PointLocation,
  endPoint: PointLocation,
  startBound: Bound | null,
  endBound: Bound | null,
  startOffset: number[] | null,
  endOffset: number[] | null
) {
  const nextStartPoint =
    startBound && startOffset
      ? getNextPoint(
          startBound,
          startPoint,
          startOffset[0],
          startOffset[1],
          startOffset[2],
          startOffset[3]
        )
      : startPoint;
  const lastEndPoint =
    endBound && endOffset
      ? getNextPoint(
          endBound,
          endPoint,
          endOffset[0],
          endOffset[1],
          endOffset[2],
          endOffset[3]
        )
      : endPoint;
  return [nextStartPoint, lastEndPoint];
}

function adjustStartEndPoint(
  startPoint: IVec3,
  endPoint: IVec3,
  startBound: Bound | null = null,
  endBound: Bound | null = null
) {
  if (!endBound) {
    if (
      Math.abs(endPoint[0] - startPoint[0]) >
      Math.abs(endPoint[1] - startPoint[1])
    ) {
      endPoint[0] += sign(endPoint[0] - startPoint[0]) * 20;
    } else {
      endPoint[1] += sign(endPoint[1] - startPoint[1]) * 20;
    }
  }
  if (!startBound) {
    if (
      Math.abs(endPoint[0] - startPoint[0]) >
      Math.abs(endPoint[1] - startPoint[1])
    ) {
      startPoint[0] -= sign(endPoint[0] - startPoint[0]) * 20;
    } else {
      startPoint[1] -= sign(endPoint[1] - startPoint[1]) * 20;
    }
  }
}

function renderRect(
  ctx: CanvasRenderingContext2D,
  bounds: IBound,
  color: string,
  lineWidth: number
) {
  const { x, y, w, h } = bounds;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([lineWidth * 2, lineWidth * 2]);
  ctx.strokeRect(x, y, w, h);
  ctx.closePath();
  ctx.restore();
}

export class ConnectionOverlay extends Overlay {
  static override overlayName = 'connection';

  private _emphasisColor: string;

  private _themeDisposer: (() => void) | null = null;

  highlightPoint: IVec | null = null;

  points: IVec[] = [];

  sourceBounds: IBound | null = null;

  targetBounds: IBound | null = null;

  constructor(gfx: GfxController) {
    super(gfx);
    this._emphasisColor = this._getEmphasisColor();
    this._setupThemeListener();
  }

  private _findConnectablesInViews() {
    const gfx = this.gfx;
    const bound = gfx.viewport.viewportBounds;
    return gfx.getElementsByBound(bound).filter(ele => ele.connectable);
  }

  private _getEmphasisColor(): string {
    return getComputedStyle(this.gfx.std.host).getPropertyValue(
      '--affine-text-emphasis-color'
    );
  }

  private _setupThemeListener(): void {
    const themeService = this.gfx.std.get(ThemeProvider);
    this._themeDisposer = effect(() => {
      themeService.theme$;
      this._emphasisColor = this._getEmphasisColor();
    });
  }

  _clearRect() {
    this.points = [];
    this.highlightPoint = null;
    this._renderer?.refresh();
  }

  override clear() {
    this.sourceBounds = null;
    this.targetBounds = null;
    this._clearRect();
  }

  override dispose() {
    this._themeDisposer?.();
    if (!this._renderer) return;
    this._renderer.removeOverlay(this);
    this._renderer = null;
  }

  override render(ctx: CanvasRenderingContext2D): void {
    const zoom = this.gfx.viewport.zoom;
    const radius = 5 / zoom;
    const color = this._emphasisColor;
    ctx.globalAlpha = 0.3; // Reduced from 0.6 to make lighter
    let lineWidth = 1 / zoom;
    if (this.sourceBounds) {
      renderRect(ctx, this.sourceBounds, color, lineWidth);
    }
    if (this.targetBounds) {
      renderRect(ctx, this.targetBounds, color, lineWidth);
    }

    // Keep lineWidth at 1px instead of 2px for thinner strokes
    this.points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], radius, 0, PI2);
      ctx.fillStyle = 'white';
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth; // Now using 1/zoom instead of 2/zoom
      ctx.fill();
      ctx.stroke();
      ctx.closePath();
    });

    ctx.globalAlpha = 1;
    if (this.highlightPoint) {
      ctx.beginPath();
      ctx.arc(this.highlightPoint[0], this.highlightPoint[1], radius, 0, PI2);
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 / zoom; // Use 1px stroke for consistency
      ctx.fill();
      ctx.stroke();
      ctx.closePath();
    }
  }

  /**
   * Render the connector at the given point. It will try to find
   * the closest connectable element and render the connector. If the
   * point is not close to any connectable element, it will just render
   * the connector at the given point.
   * @param point the point to render the connector
   * @param excludedIds the ids of the elements that should be excluded
   * @returns the connection result
   */
  renderConnector(point: IVec, excludedIds: string[] = []) {
    const connectables = this._findConnectablesInViews();
    const context = this.gfx;
    const target = [];

    this._clearRect();

    let result: Connection | null = null;
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < connectables.length; i++) {
      const connectable = connectables[i];
      // first check if in excluedIds
      if (excludedIds.includes(connectable.id)) continue;

      // then check if in expanded bound
      const bound = Bound.deserialize(connectable.xywh);
      const rotateBound = Bound.from(getBoundWithRotation(rBound(connectable)));
      // FIXME: the real path needs to be expanded: diamod, ellipse, trangle.
      if (!rotateBound.expand(10).isPointInBound(point)) continue;

      // then check if closes to anchors
      const anchors = getAnchors(connectable);
      const len = anchors.length;
      const pointerViewCoord = context.viewport.toViewCoord(point[0], point[1]);

      let shortestDistance = Number.POSITIVE_INFINITY;
      let j = 0;

      this.points = anchors.map(a => a.point);

      for (; j < len; j++) {
        const anchor = anchors[j];
        const anchorViewCoord = context.viewport.toViewCoord(
          anchor.point[0],
          anchor.point[1]
        );
        const d = Vec.dist(anchorViewCoord, pointerViewCoord);
        if (d < shortestDistance) {
          shortestDistance = d;
          target.push(connectable);
          this.highlightPoint = anchor.point;
          result = {
            id: connectable.id,
            position: anchor.coord,
          };
        }
      }

      if (shortestDistance < 8 && result) break;

      // if not, check if closes to bound
      const nearestPoint = connectable.getNearestPoint(point);

      if (Vec.dist(nearestPoint, point) < 8) {
        this.highlightPoint = nearestPoint;
        const originPoint = getPointFromBoundsWithRotation(
          rBound(connectable, true),
          nearestPoint
        );
        this._renderer?.refresh();
        target.push(connectable);
        result = {
          id: connectable.id,
          position: Vec.clampV(bound.toRelative(originPoint), 0, 1),
        };
      }

      if (result) continue;

      // if not, check if in inside of the element
      if (
        connectable.includesPoint(
          point[0],
          point[1],
          {
            ignoreTransparent: false,
          },
          this.gfx.std.host
        )
      ) {
        target.push(connectable);
        result = {
          id: connectable.id,
        };
      }
    }

    if (last(target) instanceof GroupElementModel) {
      this.targetBounds = Bound.deserialize(last(target)!.xywh);
    } else {
      this.targetBounds = null;
    }

    // at last, if not, just return the point
    if (!result) {
      result = {
        position: point,
      };
    }

    this._renderer?.refresh();

    return result;
  }
}

export class PathGenerator {
  protected _aStarRunner: AStarRunner | null = null;

  protected _prepareOrthogonalConnectorInfo(
    connectorInfo: OrthogonalConnectorInput
  ): [
    IVec,
    IVec,
    IVec,
    IVec,
    Bound | null,
    Bound | null,
    Bound | null,
    Bound | null,
  ] {
    const { startBound, endBound, startPoint, endPoint } = connectorInfo;

    const [startOffset, endOffset] = computeOffset(startBound, endBound);
    const [nextStartPoint, lastEndPoint] = computeNextStartEndpoint(
      startPoint,
      endPoint,
      startBound,
      endBound,
      startOffset,
      endOffset
    );
    const expandStartBound = startBound
      ? startBound.expand(
          startOffset[0],
          startOffset[1],
          startOffset[2],
          startOffset[3]
        )
      : null;
    const expandEndBound = endBound
      ? endBound.expand(endOffset[0], endOffset[1], endOffset[2], endOffset[3])
      : null;

    return [
      startPoint,
      endPoint,
      nextStartPoint,
      lastEndPoint,
      startBound,
      endBound,
      expandStartBound,
      expandEndBound,
    ];
  }

  generateOrthogonalConnectorPath(input: OrthogonalConnectorInput): IVec[] {
    const info = this._prepareOrthogonalConnectorInfo(input);
    const [startPoint, endPoint, nextStartPoint, lastEndPoint] = info;
    const [, , , , startBound, endBound, expandStartBound, expandEndBound] =
      info;
    const blocks = [];
    const expandBlocks = [];
    startBound && blocks.push(startBound.clone());
    endBound && blocks.push(endBound.clone());
    expandStartBound && expandBlocks.push(expandStartBound.clone());
    expandEndBound && expandBlocks.push(expandEndBound.clone());

    if (
      startBound &&
      endBound &&
      startBound.isPointInBound(endPoint) &&
      endBound.isPointInBound(startPoint)
    ) {
      return getDirectPath(startPoint, endPoint);
    }

    if (startBound && expandStartBound?.isPointInBound(endPoint, 0)) {
      return getDirectPath(startPoint, endPoint);
    }

    if (endBound && expandEndBound?.isPointInBound(startPoint, 0)) {
      return getDirectPath(startPoint, endPoint);
    }

    const points = computePoints(
      startPoint,
      endPoint,
      nextStartPoint,
      lastEndPoint,
      startBound,
      endBound,
      expandStartBound,
      expandEndBound
    );
    const finalPoints = points[0];
    const [, startPointV3, endPointV3, nextStartPointV3, lastEndPointV3] =
      points;

    adjustStartEndPoint(startPointV3, endPointV3, startBound, endBound);
    this._aStarRunner = new AStarRunner(
      finalPoints,
      nextStartPointV3,
      lastEndPointV3,
      startPointV3,
      endPointV3,
      blocks,
      expandBlocks
    );
    this._aStarRunner.run();
    const path = this._aStarRunner.path;
    if (!endBound) path.pop();
    if (!startBound) path.shift();

    return mergePath(path);
  }
}

export class ConnectorPathGenerator extends PathGenerator {
  constructor(
    private readonly options: {
      getElementById: (id: string) => GfxModel | null;
    }
  ) {
    super();
  }

  static updatePath(
    connector: ConnectorElementModel | LocalConnectorElementModel,
    path: PointLocation[] | null,
    elementGetter?: (id: string) => GfxModel | null
  ) {
    const instance = new ConnectorPathGenerator({
      getElementById: elementGetter ?? (() => null),
    });
    const points = path ?? instance._generateConnectorPath(connector) ?? [];
    // Curve mode uses bezier bounding box, others use simple point bounds
    const bound =
      connector.mode === ConnectorMode.Curve
        ? getBezierCurveBoundingBox(getBezierParameters(points))
        : getBoundFromPoints(points);
    const relativePoints = points.map((p: PointLocation) => {
      return p.setVec(Vec.sub(p, [bound.x, bound.y]));
    });

    connector.updatingPath = true;
    // the property assignment order matters
    connector.xywh = bound.serialize();
    connector.path = relativePoints;

    // Updates Connector's Label position.
    if (isConnectorWithLabel(connector)) {
      const model = connector as ConnectorElementModel;
      const [cx, cy] = model.getPointByOffsetDistance(
        model.labelOffset.distance
      );
      const [, , w, h] = model.labelXYWH!;
      model.labelXYWH = [cx - w / 2, cy - h / 2, w, h];
    }

    connector.updatingPath = false;
  }

  private _computeStartEndPoint(
    connector: ConnectorElementModel | LocalConnectorElementModel
  ) {
    const { source, target } = connector;
    const start = this._getConnectorEndElement(connector, 'source');
    const end = this._getConnectorEndElement(connector, 'target');

    let startPoint: PointLocation | null = null;
    let endPoint: PointLocation | null = null;
    if (
      source.id &&
      !source.position &&
      target.id &&
      !target.position &&
      start &&
      end
    ) {
      const startAnchors = getAnchors(start);
      const endAnchors = getAnchors(end);
      let minDist = Infinity;
      let minStartAnchor = new PointLocation();
      let minEndAnchor = new PointLocation();
      for (const sa of startAnchors) {
        for (const ea of endAnchors) {
          const dist = Vec.dist(sa.point, ea.point);
          if (dist + 0.1 < minDist) {
            minDist = dist;
            minStartAnchor = sa.point;
            minEndAnchor = ea.point;
          }
        }
      }
      startPoint = minStartAnchor;
      endPoint = minEndAnchor;
    } else {
      startPoint = this._getConnectionPoint(connector, 'source');
      endPoint = this._getConnectionPoint(connector, 'target');
    }

    if (!startPoint || !endPoint) return [];

    return [startPoint, endPoint];
  }

  private _generateConnectorPath(
    connector: ConnectorElementModel | LocalConnectorElementModel
  ) {
    const { mode } = connector;
    if (mode === ConnectorMode.Straight) {
      return this._generateStraightConnectorPath(connector);
    } else if (
      mode === ConnectorMode.Orthogonal ||
      mode === ConnectorMode.Rounded
    ) {
      // Rounded uses the same path generation as Orthogonal,
      // the rounded corners are handled during rendering
      const start = this._getConnectorEndElement(connector, 'source');
      const end = this._getConnectorEndElement(connector, 'target');

      const [startPoint, endPoint] = this._computeStartEndPoint(connector);

      const startBound = start
        ? Bound.from(getBoundWithRotation(rBound(start)))
        : null;
      const endBound = end
        ? Bound.from(getBoundWithRotation(rBound(end)))
        : null;

      // Check for user-defined waypoints (only on ConnectorElementModel, not Local)
      const waypoints =
        'waypoints' in connector ? connector.waypoints : undefined;

      if (waypoints && waypoints.length > 0) {
        // Route through waypoints
        return this._generatePathThroughWaypoints(
          startPoint,
          endPoint,
          startBound,
          endBound,
          waypoints
        );
      }

      const path = this.generateOrthogonalConnectorPath({
        startPoint,
        endPoint,
        startBound,
        endBound,
      });
      return path.map(p => new PointLocation(p));
    } else if (mode === ConnectorMode.Curve) {
      return this._generateCurveConnectorPath(connector);
    }
    throw new Error('unknown connector mode');
  }

  /**
   * Generate a path that routes through user-defined waypoints.
   * Waypoints are intermediate turn points that the connector must pass through.
   */
  private _generatePathThroughWaypoints(
    startPoint: PointLocation,
    endPoint: PointLocation,
    _startBound: Bound | null,
    _endBound: Bound | null,
    waypoints: IVec[]
  ): PointLocation[] {
    const [, , nextStartPoint, lastEndPoint] =
      this._prepareOrthogonalConnectorInfo({
        startPoint,
        endPoint,
        startBound: _startBound,
        endBound: _endBound,
      });

    const pointsEqual = (a: IVec | PointLocation, b: IVec | PointLocation) =>
      Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001;

    // Build path by connecting: start -> tail anchor -> wp1 -> ... -> tail anchor -> end
    // Waypoints represent intermediate turn points; tail anchors preserve orientation.

    const fullPath: PointLocation[] = [startPoint];

    // For orthogonal connectors, waypoints define the turn points.
    // We build a path through them while keeping tail anchors perpendicular.

    const startAnchor = new PointLocation(nextStartPoint);
    if (!pointsEqual(startPoint, nextStartPoint)) {
      fullPath.push(startAnchor);
    }

    let currentPoint = startAnchor;

    // Small tolerance to avoid creating micro-segments from tiny float drift.
    const axisEpsilon = 0.5;

    waypoints.forEach((wp, index) => {
      // Create orthogonal path from current point to waypoint
      // We need to determine if we should go horizontal-then-vertical
      // or vertical-then-horizontal based on the direction

      const dx = wp[0] - currentPoint[0];
      const dy = wp[1] - currentPoint[1];

      const prevWaypoint = index > 0 ? waypoints[index - 1] : null;
      const isDuplicateWaypoint =
        prevWaypoint &&
        Math.abs(prevWaypoint[0] - wp[0]) <= axisEpsilon &&
        Math.abs(prevWaypoint[1] - wp[1]) <= axisEpsilon;

      // For the first segment from start, prefer to exit based on start bound
      // For subsequent segments, alternate based on previous direction

      // Preserve explicit duplicate waypoints to create a zero-length segment.
      if (
        isDuplicateWaypoint &&
        Math.abs(dx) <= axisEpsilon &&
        Math.abs(dy) <= axisEpsilon
      ) {
        fullPath.push(new PointLocation([currentPoint[0], currentPoint[1]]));
        return;
      }

      // If both axes move beyond tolerance, add an elbow.
      if (Math.abs(dx) > axisEpsilon && Math.abs(dy) > axisEpsilon) {
        // Need a turn - add intermediate point
        // Go horizontal first, then vertical
        const intermediate = new PointLocation([wp[0], currentPoint[1]]);
        fullPath.push(intermediate);
      }

      // Snap near-aligned points to avoid tiny segments.
      const snappedWp: IVec = [
        Math.abs(dx) <= axisEpsilon ? currentPoint[0] : wp[0],
        Math.abs(dy) <= axisEpsilon ? currentPoint[1] : wp[1],
      ];
      // If snapping collapses the point, skip it.
      if (
        Math.abs(snappedWp[0] - currentPoint[0]) <= axisEpsilon &&
        Math.abs(snappedWp[1] - currentPoint[1]) <= axisEpsilon
      ) {
        return;
      }

      const wpPoint = new PointLocation(snappedWp);
      fullPath.push(wpPoint);
      currentPoint = wpPoint;
    });

    // Final segment: last waypoint (or start anchor) to end anchor/end
    const endAnchor = new PointLocation(lastEndPoint);
    const lastPoint = fullPath[fullPath.length - 1];
    const dx = endAnchor[0] - lastPoint[0];
    const dy = endAnchor[1] - lastPoint[1];

    if (Math.abs(dx) > axisEpsilon && Math.abs(dy) > axisEpsilon) {
      // Need a turn to reach end - add intermediate point
      // Go horizontal first to align X, then vertical
      const intermediate = new PointLocation([endAnchor[0], lastPoint[1]]);
      fullPath.push(intermediate);
    }

    if (!pointsEqual(lastPoint, endAnchor)) {
      fullPath.push(endAnchor);
    }

    if (!pointsEqual(endAnchor, endPoint)) {
      fullPath.push(endPoint);
    }

    return fullPath;
  }

  private _generateCurveConnectorPath(
    connector: ConnectorElementModel | LocalConnectorElementModel
  ) {
    const { source, target } = connector;
    let startPoint: PointLocation | null = null;
    let endPoint: PointLocation | null = null;

    if (source.id || target.id) {
      if (!source.position && !target.position) {
        const start = this._getConnectorEndElement(
          connector,
          'source'
        ) as Connectable;
        const end = this._getConnectorEndElement(
          connector,
          'target'
        ) as Connectable;
        const sb = Bound.deserialize(start.xywh);
        const eb = Bound.deserialize(end.xywh);
        startPoint = getNearestConnectableAnchor(start, eb.center);
        endPoint = getNearestConnectableAnchor(end, sb.center);
      } else {
        startPoint = this._getConnectionPoint(connector, 'source');
        endPoint = this._getConnectionPoint(connector, 'target');
      }

      if (!startPoint || !endPoint) return [];

      if (source.id) {
        const startTangentVertical = Vec.rot(startPoint.tangent, -Math.PI / 2);
        startPoint.out = isVecZero(startTangentVertical)
          ? Vec.mul(Vec.per(Vec.normalize(Vec.sub(startPoint, endPoint))), 20)
          : Vec.mul(
              startTangentVertical,
              Math.max(
                100,
                Math.abs(
                  Vec.pry(Vec.sub(endPoint, startPoint), startTangentVertical)
                ) / 3
              )
            );
      }
      if (target.id) {
        const endTangentVertical = Vec.rot(endPoint.tangent, -Math.PI / 2);
        endPoint.in = isVecZero(endTangentVertical)
          ? Vec.mul(Vec.per(Vec.normalize(Vec.sub(endPoint, startPoint))), 20)
          : Vec.mul(
              endTangentVertical,
              Math.max(
                100,
                Math.abs(
                  Vec.pry(Vec.sub(startPoint, endPoint), endTangentVertical)
                ) / 3
              )
            );
      }
      return [startPoint, endPoint];
    } else {
      startPoint = this._getConnectionPoint(connector, 'source');
      endPoint = this._getConnectionPoint(connector, 'target');

      if (!startPoint || !endPoint) return [];

      if (
        Math.abs(endPoint[0] - startPoint[0]) >
        Math.abs(endPoint[1] - startPoint[1])
      ) {
        startPoint.out = [Vec.mul(Vec.sub(endPoint, startPoint), 2 / 3)[0], 0];
        endPoint.in = [Vec.mul(Vec.sub(startPoint, endPoint), 2 / 3)[0], 0];
      } else {
        startPoint.out = [0, Vec.mul(Vec.sub(endPoint, startPoint), 2 / 3)[1]];
        endPoint.in = [0, Vec.mul(Vec.sub(startPoint, endPoint), 2 / 3)[1]];
      }
      return [startPoint, endPoint];
    }
  }

  private _generateStraightConnectorPath(
    connector: ConnectorElementModel | LocalConnectorElementModel
  ) {
    const { source, target } = connector;
    if (source.id && !source.position && target.id && !target.position) {
      const start = this._getConnectorEndElement(
        connector,
        'source'
      ) as Connectable;
      const end = this._getConnectorEndElement(
        connector,
        'target'
      ) as Connectable;
      const sb = Bound.deserialize(start.xywh);
      const eb = Bound.deserialize(end.xywh);
      const startPoint = getNearestConnectableAnchor(start, eb.center);
      const endPoint = getNearestConnectableAnchor(end, sb.center);
      return (startPoint && endPoint && [startPoint, endPoint]) ?? [];
    } else {
      const endPoint = this._getConnectionPoint(connector, 'target');
      const startPoint = this._getConnectionPoint(connector, 'source');
      return (startPoint && endPoint && [startPoint, endPoint]) ?? [];
    }
  }

  private _getConnectionPoint(
    connector: ConnectorElementModel | LocalConnectorElementModel,
    type: 'source' | 'target'
  ): PointLocation | null {
    const connection = connector[type];

    if (!connection) return null;

    const connectable = this._getConnectorEndElement(connector, type);

    if (!connectable && connection.position) {
      return PointLocation.fromVec(connection.position);
    }

    if (!connectable) return null;

    let point: PointLocation | null = null;

    if (connection.position) {
      point = getConnectableRelativePosition(connectable, connection.position);
    } else {
      const anotherType = type === 'source' ? 'target' : 'source';
      const otherPoint = this._getConnectionPoint(connector, anotherType);
      if (otherPoint) {
        point = getNearestConnectableAnchor(connectable, otherPoint);
      }
    }

    return point;
  }

  private _getConnectorEndElement(
    connector: ConnectorElementModel | LocalConnectorElementModel,
    type: 'source' | 'target'
  ): Connectable | null {
    const id = connector[type].id;

    if (id) {
      const element = this.options.getElementById(id) as Connectable | null;
      if (!element) return null;
      if (
        'hidden' in element &&
        element.hidden &&
        'collapseProxyId' in element &&
        typeof element.collapseProxyId === 'string'
      ) {
        const proxy = this.options.getElementById(
          element.collapseProxyId
        ) as Connectable | null;
        if (proxy) return proxy;
      }
      return element;
    }

    return null;
  }

  hasRelatedElement(
    connecter: ConnectorElementModel | LocalConnectorElementModel
  ) {
    const { source, target } = connecter;
    if (
      (source.id && !this.options.getElementById(source.id)) ||
      (target.id && !this.options.getElementById(target.id))
    ) {
      return false;
    }

    return true;
  }
}
