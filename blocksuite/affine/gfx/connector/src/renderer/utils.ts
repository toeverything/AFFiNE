import type { RoughCanvas } from '@blocksuite/affine-block-surface';
import {
  type ConnectorElementModel,
  ConnectorMode,
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

/**
 * Create an SVG path string for a connector with jump markers.
 * Based on draw.io's jump rendering (Graph.js:9161-9292).
 */
export function createConnectorPathWithJumps(
  routedPoints: { type: 0 | 1; x: number; y: number }[],
  jumpStyle: JumpStyle,
  jumpSize: number,
  strokeWidth: number
): string {
  if (routedPoints.length < 2) return '';

  const pathBuilder = new SVGPathBuilder();
  const size = (jumpSize - 2) / 2 + strokeWidth;
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

        // Determine flip factor for jump direction
        const f =
          Math.round(nx) < 0 || (Math.round(nx) === 0 && Math.round(ny) <= 0)
            ? 1
            : -1;

        // Render based on jump style
        switch (jumpStyle) {
          case 'sharp':
            // Sharp angle perpendicular to line
            pathBuilder.lineTo(p0x, p0y);
            pathBuilder.lineTo(p0x - ny * f, p0y + nx * f);
            pathBuilder.lineTo(p1x - ny * f, p1y + nx * f);
            pathBuilder.lineTo(p1x, p1y);
            break;

          case 'arc': {
            // Curved arc over intersection
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
            // Crossing lines (X shape)
            pathBuilder.lineTo(p0x, p0y);
            pathBuilder.moveTo(p0x + ny * f, p0y - nx * f);
            pathBuilder.lineTo(p0x - ny * f, p0y + nx * f);
            pathBuilder.moveTo(p1x - ny * f, p1y + nx * f);
            pathBuilder.lineTo(p1x + ny * f, p1y - nx * f);
            pathBuilder.moveTo(p1x, p1y);
            moveTo = true;
            pendingMoveTo = { x: p1x, y: p1y };
            break;

          case 'gap':
            // Gap - just move without drawing
            pathBuilder.lineTo(p0x, p0y);
            pathBuilder.moveTo(p1x, p1y);
            moveTo = true;
            pendingMoveTo = { x: p1x, y: p1y };
            break;

          default:
            // 'none' - straight through
            pathBuilder.lineTo(next.x, next.y);
            break;
        }

        if (jumpStyle === 'sharp' || jumpStyle === 'arc') {
          pendingMoveTo = { x: p1x, y: p1y };
          moveTo = true;
        }
      }
    } else {
      // Normal waypoint - just draw line
      pathBuilder.lineTo(next.x, next.y);
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
