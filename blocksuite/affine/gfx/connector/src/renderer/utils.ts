import type { RoughCanvas } from '@blocksuite/affine-block-surface';
import {
  type ConnectorElementModel,
  ConnectorMode,
  DEFAULT_CONNECTOR_CORNER_RADIUS,
  type JumpStyle,
  type LocalConnectorElementModel,
} from '@blocksuite/affine-model';
import type {
  BezierCurveParameters,
  IVec,
  PointLocation,
} from '@blocksuite/global/gfx';
import {
  getBezierParameters,
  getBezierTangent,
  SVGPathBuilder,
  Vec,
} from '@blocksuite/global/gfx';

type ConnectorEnd = 'Front' | 'Rear';

export const DEFAULT_ARROW_SIZE = 15;
const DRAWIO_MARKER_BASE = {
  width: 32,
  height: 20,
  tipX: 4,
  centerY: 10,
};
export const DRAWIO_MARKER_SIZE_MULTIPLIER = 3;

const DRAWIO_MARKER_DEFS: Record<
  string,
  { path: string; strokeOnly?: boolean }
> = {
  classic: { path: 'M 0 8 L 10 2 L 5 8 L 10 14 Z' },
  classicThin: { path: 'M 0 8 L 8 4 L 5 8 L 8 12 Z' },
  open: { path: 'M 8 0 L 0 8 L 8 16', strokeOnly: true },
  openThin: { path: 'M 8 4 L 0 8 L 8 12', strokeOnly: true },
  block: { path: 'M 0 8 L 8 2 L 8 14 Z' },
  blockThin: { path: 'M 0 8 L 8 4 L 8 12 Z' },
  oval: {
    path: 'M 0 8 A 5 5 0 0 1 5 3 A 5 5 0 0 1 11 8 A 5 5 0 0 1 5 13 A 5 5 0 0 1 0 8 Z',
  },
  diamond: { path: 'M 0 8 L 6 2 L 12 8 L 6 14 Z' },
  diamondThin: { path: 'M 0 8 L 8 3 L 16 8 L 8 13 Z' },
  doubleBlock: { path: 'M 0 8 L 8 2 L 8 14 Z M 8 8 L 16 2 L 16 14 Z' },
  box: { path: 'M 0 3 L 10 3 L 10 13 L 0 13 Z' },
  halfCircle: {
    path: 'M 0 3 A 5 5 0 0 1 5 8 A 5 5 0 0 1 0 13',
    strokeOnly: true,
  },
  openAsync: { path: 'M 8 4 L 0 8 L 24 8', strokeOnly: true },
  async: { path: 'M 6 8 L 6 4 L 0 8 L 24 8' },
  dash: { path: 'M 0 2 L 12 14', strokeOnly: true },
  baseDash: { path: 'M 0 2 L 0 14', strokeOnly: true },
  cross: { path: 'M 0 2 L 12 14 M 12 2 L 0 14', strokeOnly: true },
  circle: {
    path: 'M 0 8 A 6 6 0 0 1 6 2 A 6 6 0 0 1 12 8 A 6 6 0 0 1 6 14 A 6 6 0 0 1 0 8 Z',
    strokeOnly: true,
  },
  circlePlus: {
    path: 'M 0 8 A 6 6 0 0 1 6 2 A 6 6 0 0 1 12 8 A 6 6 0 0 1 6 14 A 6 6 0 0 1 0 8 Z M 6 2 L 6 14',
    strokeOnly: true,
  },
  ERone: { path: 'M 5 2 L 5 14', strokeOnly: true },
  ERmandOne: { path: 'M 6 2 L 6 14 M 9 2 L 9 14', strokeOnly: true },
  ERmany: { path: 'M 0 2 L 12 8 L 0 14', strokeOnly: true },
  ERoneToMany: { path: 'M 0 2 L 12 8 L 0 14 M 15 2 L 15 14', strokeOnly: true },
  ERzeroToOne: {
    path: 'M 8 8 A 5 5 0 0 1 13 3 A 5 5 0 0 1 18 8 A 5 5 0 0 1 13 13 A 5 5 0 0 1 8 8 Z M 4 3 L 4 13',
    strokeOnly: true,
  },
  ERzeroToMany: {
    path: 'M 8 8 A 5 5 0 0 1 13 3 A 5 5 0 0 1 18 8 A 5 5 0 0 1 13 13 A 5 5 0 0 1 8 8 Z M 0 3 L 8 8 L 0 13',
    strokeOnly: true,
  },
};

export function getDrawioMarkerDef(style: string) {
  return DRAWIO_MARKER_DEFS[style] ?? null;
}

export function resolveConnectorCornerRadius(
  model: ConnectorElementModel | LocalConnectorElementModel
) {
  return 'cornerRadius' in model
    ? (model.cornerRadius as number)
    : DEFAULT_CONNECTOR_CORNER_RADIUS;
}

/**
 * Create an SVG path string for a connector with jump markers.
 * Based on draw.io's jump rendering (Graph.js:9161-9292).
 */
export function createConnectorPathWithJumps(
  routedPoints: { type: 0 | 1; x: number; y: number }[],
  jumpStyle: JumpStyle,
  jumpSize: number,
  strokeWidth: number,
  rounded: boolean = false,
  cornerRadius: number = 0
): string {
  if (routedPoints.length < 2) return '';

  const pathBuilder = new SVGPathBuilder();
  const size = jumpSize / 2 + strokeWidth * 1.5;
  if (!rounded || cornerRadius <= 0) {
    let moveTo = true;
    let pendingMoveTo: { x: number; y: number } | null = null;

    for (let i = 0; i < routedPoints.length - 1; i++) {
      let current = routedPoints[i];
      const next = routedPoints[i + 1];

      if (pendingMoveTo) {
        // After a jump, resume the path at the far side of the gap.
        current = { type: 0, x: pendingMoveTo.x, y: pendingMoveTo.y };
        pathBuilder.moveTo(current.x, current.y);
        pendingMoveTo = null;
        moveTo = false;
      } else if (i === 0 || moveTo) {
        pathBuilder.moveTo(current.x, current.y);
        moveTo = false;
      }

      // Type 1 means jump point (intersection)
      if (next.type === 1) {
        // Calculate direction vector and perpendicular offset
        const dx = next.x - current.x;
        const dy = next.y - current.y;
        const len = Math.hypot(dx, dy);

        if (len > 0) {
          const nx = (dx / len) * size;
          const ny = (dy / len) * size;

          const p0x = next.x - nx;
          const p0y = next.y - ny;
          const p1x = next.x + nx;
          const p1y = next.y + ny;

          const gapOffset = Math.max(strokeWidth, size * 0.2);
          const gap0x = p0x - (dx / len) * gapOffset;
          const gap0y = p0y - (dy / len) * gapOffset;
          const gap1x = p1x + (dx / len) * gapOffset;
          const gap1y = p1y + (dy / len) * gapOffset;

          // Determine flip factor for jump direction
          const f =
            Math.round(nx) < 0 || (Math.round(nx) === 0 && Math.round(ny) <= 0)
              ? 1
              : -1;

          // Render based on jump style
          switch (jumpStyle) {
            case 'sharp':
              // Sharp angle perpendicular to line
              pathBuilder.lineTo(gap0x, gap0y);
              pathBuilder.moveTo(p0x, p0y);
              pathBuilder.lineTo(p0x - ny * f, p0y + nx * f);
              pathBuilder.lineTo(p1x - ny * f, p1y + nx * f);
              pathBuilder.lineTo(p1x, p1y);
              pathBuilder.moveTo(gap1x, gap1y);
              break;

            case 'arc': {
              // Curved arc over intersection
              const arcF = f * 1.3;
              pathBuilder.lineTo(gap0x, gap0y);
              pathBuilder.moveTo(p0x, p0y);
              pathBuilder.curveTo(
                p0x - ny * arcF,
                p0y + nx * arcF,
                p1x - ny * arcF,
                p1y + nx * arcF,
                p1x,
                p1y
              );
              pathBuilder.moveTo(gap1x, gap1y);
              break;
            }

            case 'line':
              // Crossing lines (X shape)
              pathBuilder.lineTo(gap0x, gap0y);
              pathBuilder.moveTo(p0x, p0y);
              pathBuilder.moveTo(p0x + ny * f, p0y - nx * f);
              pathBuilder.lineTo(p0x - ny * f, p0y + nx * f);
              pathBuilder.moveTo(p1x - ny * f, p1y + nx * f);
              pathBuilder.lineTo(p1x + ny * f, p1y - nx * f);
              pathBuilder.moveTo(gap1x, gap1y);
              moveTo = true;
              pendingMoveTo = { x: gap1x, y: gap1y };
              break;

            case 'gap':
              // Gap - just move without drawing
              pathBuilder.lineTo(gap0x, gap0y);
              pathBuilder.moveTo(gap1x, gap1y);
              moveTo = true;
              pendingMoveTo = { x: gap1x, y: gap1y };
              break;

            default:
              // 'none' - straight through
              pathBuilder.lineTo(next.x, next.y);
              break;
          }

          if (jumpStyle === 'sharp' || jumpStyle === 'arc') {
            pendingMoveTo = { x: gap1x, y: gap1y };
            moveTo = true;
          }
        }
      } else {
        // Normal waypoint - just draw line
        pathBuilder.lineTo(next.x, next.y);
      }
    }
  } else {
    const flushRoundedSegment = (points: { x: number; y: number }[]) => {
      if (points.length < 2) return;
      pathBuilder.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        const len1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        const len2 = Math.hypot(next.x - curr.x, next.y - curr.y);
        if (len1 < 0.001 || len2 < 0.001) {
          pathBuilder.lineTo(curr.x, curr.y);
          continue;
        }
        const r = Math.min(cornerRadius, len1 / 2, len2 / 2);
        const v1x = (curr.x - prev.x) / len1;
        const v1y = (curr.y - prev.y) / len1;
        const v2x = (next.x - curr.x) / len2;
        const v2y = (next.y - curr.y) / len2;
        const startX = curr.x - v1x * r;
        const startY = curr.y - v1y * r;
        const endX = curr.x + v2x * r;
        const endY = curr.y + v2y * r;
        pathBuilder.lineTo(startX, startY);
        pathBuilder.curveTo(curr.x, curr.y, curr.x, curr.y, endX, endY);
      }
      const last = points[points.length - 1];
      pathBuilder.lineTo(last.x, last.y);
    };

    let segmentPoints: { x: number; y: number }[] = [];
    if (routedPoints[0]) {
      segmentPoints.push({ x: routedPoints[0].x, y: routedPoints[0].y });
    }

    for (let i = 0; i < routedPoints.length - 1; i++) {
      const current = routedPoints[i];
      const next = routedPoints[i + 1];

      if (next.type === 1) {
        if (segmentPoints.length > 1) {
          flushRoundedSegment(segmentPoints);
        }
        segmentPoints = [];

        const dx = next.x - current.x;
        const dy = next.y - current.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const nx = (dx / len) * size;
          const ny = (dy / len) * size;
          const p0x = next.x - nx;
          const p0y = next.y - ny;
          const p1x = next.x + nx;
          const p1y = next.y + ny;
          const f =
            Math.round(nx) < 0 || (Math.round(nx) === 0 && Math.round(ny) <= 0)
              ? 1
              : -1;

          switch (jumpStyle) {
            case 'sharp':
              pathBuilder.lineTo(p0x, p0y);
              pathBuilder.lineTo(p0x - ny * f, p0y + nx * f);
              pathBuilder.lineTo(p1x - ny * f, p1y + nx * f);
              pathBuilder.lineTo(p1x, p1y);
              break;
            case 'arc': {
              const arcF = f * 1.3;
              pathBuilder.lineTo(p0x, p0y);
              pathBuilder.curveTo(
                p0x - ny * arcF,
                p0y + nx * arcF,
                p1x - ny * arcF,
                p1y + nx * arcF,
                p1x,
                p1y
              );
              break;
            }
            case 'line':
              pathBuilder.lineTo(p0x, p0y);
              pathBuilder.moveTo(p0x + ny * f, p0y - nx * f);
              pathBuilder.lineTo(p0x - ny * f, p0y + nx * f);
              pathBuilder.moveTo(p1x - ny * f, p1y + nx * f);
              pathBuilder.lineTo(p1x + ny * f, p1y - nx * f);
              pathBuilder.moveTo(p1x, p1y);
              break;
            case 'gap':
              pathBuilder.lineTo(p0x, p0y);
              pathBuilder.moveTo(p1x, p1y);
              break;
            default:
              pathBuilder.lineTo(next.x, next.y);
              break;
          }

          segmentPoints.push({ x: p1x, y: p1y });
        }
      } else {
        segmentPoints.push({ x: next.x, y: next.y });
      }
    }

    if (segmentPoints.length > 1) {
      flushRoundedSegment(segmentPoints);
    }
  }

  return pathBuilder.build();
}

export function getArrowPoints(
  points: PointLocation[],
  size = 10,
  mode: ConnectorMode,
  bezierParameters: BezierCurveParameters,
  endPoint: ConnectorEnd = 'Rear',
  radians: number = Math.PI / 4
) {
  const anchorPoint = getPointWithTangent(
    points,
    mode,
    endPoint,
    bezierParameters
  );
  const unit = Vec.mul(anchorPoint.tangent, -1);
  const angle = endPoint === 'Front' ? Math.PI : 0;

  return {
    points: [
      Vec.add(Vec.mul(Vec.rot(unit, angle + radians), size), anchorPoint),
      anchorPoint,
      Vec.add(Vec.mul(Vec.rot(unit, angle - radians), size), anchorPoint),
    ],
  };
}

export function getCircleCenterPoint(
  points: PointLocation[],
  radius = 5,
  mode: ConnectorMode,
  bezierParameters: BezierCurveParameters,
  endPoint: ConnectorEnd = 'Rear'
) {
  const anchorPoint = getPointWithTangent(
    points,
    mode,
    endPoint,
    bezierParameters
  );

  const unit = Vec.mul(anchorPoint.tangent, -1);
  const angle = endPoint === 'Front' ? Math.PI : 0;

  return Vec.add(Vec.mul(Vec.rot(unit, angle), radius), anchorPoint);
}

export function getPointWithTangent(
  points: PointLocation[],
  mode: ConnectorMode,
  endPoint: ConnectorEnd,
  bezierParameters: BezierCurveParameters
) {
  const anchorIndex = endPoint === 'Rear' ? points.length - 1 : 0;
  const pointToAnchorIndex =
    endPoint === 'Rear' ? anchorIndex - 1 : anchorIndex + 1;
  const anchorPoint = points[anchorIndex];
  const pointToAnchor = points[pointToAnchorIndex];

  const clone = anchorPoint.clone();
  let tangent;
  if (mode !== ConnectorMode.Curve) {
    tangent =
      endPoint === 'Rear'
        ? Vec.tangent(anchorPoint, pointToAnchor)
        : Vec.tangent(pointToAnchor, anchorPoint);
  } else {
    tangent =
      endPoint === 'Rear'
        ? getBezierTangent(bezierParameters, 1)
        : getBezierTangent(bezierParameters, 0);
  }
  clone.tangent = tangent ?? [0, 0];

  return clone;
}

export function getDiamondPoints(
  point: PointLocation,
  size = 10,
  endPoint: ConnectorEnd = 'Rear'
) {
  const unit = Vec.mul(point.tangent, -1);
  const angle = endPoint === 'Front' ? Math.PI : 0;

  const diamondPoints = [
    Vec.add(Vec.mul(Vec.rot(unit, angle + Math.PI * 0.25), size), point),
    point,
    Vec.add(Vec.mul(Vec.rot(unit, angle - Math.PI * 0.25), size), point),
    Vec.add(Vec.mul(Vec.rot(unit, angle), size * Math.sqrt(2)), point),
  ];

  return {
    points: diamondPoints,
  };
}

export type ArrowOptions = ReturnType<typeof getArrowOptions>;

export function getArrowOptions(
  end: ConnectorEnd,
  model: ConnectorElementModel | LocalConnectorElementModel,
  strokeColor: string
) {
  const { seed, mode, rough, roughness, strokeWidth, path } = model;

  return {
    end,
    seed,
    mode,
    rough,
    roughness,
    strokeWidth,
    strokeColor,
    fillColor: strokeColor,
    fillStyle: 'solid',
    bezierParameters: getBezierParameters(path),
  };
}

export function getRcOptions(options: ArrowOptions) {
  const { seed, roughness, strokeWidth, strokeColor, fillColor } = options;
  return {
    seed,
    roughness,
    stroke: strokeColor,
    strokeWidth,
    fill: fillColor,
    fillStyle: 'solid',
  };
}

export function renderRoundedPolygon(
  ctx: CanvasRenderingContext2D,
  points: IVec[],
  color: string,
  strokeWidth: number,
  fill: boolean = true
) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.beginPath();

  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      ctx.moveTo(points[i][0], points[i][1]);
    } else {
      ctx.lineTo(points[i][0], points[i][1]);
    }
  }

  if (fill) {
    ctx.closePath();
    ctx.fill();
  }

  ctx.stroke();
  ctx.restore();
}

export function renderArrow(
  points: PointLocation[],
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  options: ArrowOptions
) {
  const { mode, end, bezierParameters, rough, strokeColor, strokeWidth } =
    options;
  const radians = Math.PI / 4;
  const size = DEFAULT_ARROW_SIZE * (strokeWidth / 2);
  const { points: arrowPoints } = getArrowPoints(
    points,
    size,
    mode,
    bezierParameters,
    end,
    radians
  );

  if (rough) {
    rc.linearPath(arrowPoints as [number, number][], getRcOptions(options));
  } else {
    renderRoundedPolygon(ctx, arrowPoints, strokeColor, strokeWidth, false);
  }
}

export function renderTriangle(
  points: PointLocation[],
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  options: ArrowOptions
) {
  const { mode, end, bezierParameters, rough, strokeColor, strokeWidth } =
    options;
  const radians = Math.PI / 6;
  const size = DEFAULT_ARROW_SIZE * (strokeWidth / 2);
  const { points: trianglePoints } = getArrowPoints(
    points,
    size,
    mode,
    bezierParameters,
    end,
    radians
  );

  if (rough) {
    rc.polygon(
      [
        [trianglePoints[0][0], trianglePoints[0][1]],
        [trianglePoints[1][0], trianglePoints[1][1]],
        [trianglePoints[2][0], trianglePoints[2][1]],
      ],
      getRcOptions(options)
    );
  } else {
    renderRoundedPolygon(ctx, trianglePoints, strokeColor, strokeWidth);
  }
}

export function renderDiamond(
  points: PointLocation[],
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  options: ArrowOptions
) {
  const { mode, end, rough, bezierParameters, strokeColor, strokeWidth } =
    options;
  const anchorPoint = getPointWithTangent(points, mode, end, bezierParameters);
  const size = 10 * (strokeWidth / 2);
  const { points: diamondPoints } = getDiamondPoints(anchorPoint, size, end);

  if (rough) {
    rc.polygon(
      [
        [diamondPoints[0][0], diamondPoints[0][1]],
        [diamondPoints[1][0], diamondPoints[1][1]],
        [diamondPoints[2][0], diamondPoints[2][1]],
        [diamondPoints[3][0], diamondPoints[3][1]],
      ],
      getRcOptions(options)
    );
  } else {
    renderRoundedPolygon(ctx, diamondPoints, strokeColor, strokeWidth);
  }
}

export function renderCircle(
  points: PointLocation[],
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  options: ArrowOptions
) {
  const {
    bezierParameters,
    mode,
    end,
    fillColor,
    strokeColor,
    strokeWidth,
    rough,
  } = options;
  const radius = 5 * (strokeWidth / 2);
  const centerPoint = getCircleCenterPoint(
    points,
    radius,
    mode,
    bezierParameters,
    end
  );
  const cx = centerPoint[0];
  const cy = centerPoint[1];

  if (rough) {
    // radius + 2 when render rough circle to avoid connector line cross the circle and make it looks bad
    rc.circle(cx, cy, radius + 2, getRcOptions(options));
  } else {
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius, radius, 0, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

export function renderDrawioMarker(
  points: PointLocation[],
  ctx: CanvasRenderingContext2D,
  options: ArrowOptions,
  style: string
) {
  const def = getDrawioMarkerDef(style);
  if (!def) return;

  const { end, mode, bezierParameters, strokeColor, strokeWidth } = options;
  const anchorPoint = getPointWithTangent(points, mode, end, bezierParameters);
  const direction = Vec.mul(anchorPoint.tangent, -1);
  const orient = end === 'Rear' ? direction : Vec.mul(direction, -1);
  const angle = Math.atan2(orient[1], orient[0]);
  const size = DEFAULT_ARROW_SIZE * (strokeWidth / 2);
  const scale =
    (size * DRAWIO_MARKER_SIZE_MULTIPLIER) / DRAWIO_MARKER_BASE.width;
  const path = new Path2D(def.path);

  ctx.save();
  ctx.translate(anchorPoint[0], anchorPoint[1]);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.translate(-DRAWIO_MARKER_BASE.tipX, -DRAWIO_MARKER_BASE.centerY);
  ctx.translate(4, 2);
  ctx.lineWidth = Math.max(1, strokeWidth / 2);
  ctx.strokeStyle = strokeColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (def.strokeOnly) {
    ctx.stroke(path);
  } else {
    ctx.fillStyle = strokeColor;
    ctx.fill(path);
    ctx.stroke(path);
  }

  ctx.restore();
}
