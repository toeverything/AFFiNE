import {
  type CanvasRenderer,
  type ElementRenderer,
  ElementRendererExtension,
  type RoughCanvas,
} from '@blocksuite/affine-block-surface';
import {
  getFontString,
  getLineHeight,
  getTextWidth,
  isRTL,
  type TextDelta,
  wrapTextDeltas,
} from '@blocksuite/affine-gfx-text';
import {
  type ConnectorElementModel,
  ConnectorMode,
  DEFAULT_CONNECTOR_CORNER_RADIUS,
  DefaultTheme,
  type JumpStyle,
  type LocalConnectorElementModel,
  type PointStyle,
  StrokeStyle,
} from '@blocksuite/affine-model';
import { getAffinePlaceholderFillColor } from '@blocksuite/affine-shared/theme';
import {
  getBezierParameters,
  type PointLocation,
} from '@blocksuite/global/gfx';
import { deltaInsertsToChunks } from '@blocksuite/std/inline';

import { isConnectorWithLabel } from '../connector-manager';
import {
  createConnectorPathWithJumps,
  DEFAULT_ARROW_SIZE,
  getArrowOptions,
  renderArrow,
  renderCircle,
  renderDiamond,
  renderDrawioMarker,
  renderTriangle,
  resolveConnectorCornerRadius,
} from './utils';

export const connector: ElementRenderer<
  ConnectorElementModel | LocalConnectorElementModel
> = (model, ctx, matrix, renderer, rc) => {
  const {
    mode,
    path: points,
    strokeStyle,
    frontEndpointStyle,
    rearEndpointStyle,
    strokeWidth,
  } = model;

  // points might not be build yet in some senarios
  // eg. undo/redo, copy/paste
  if (!points.length || points.length < 2) {
    return;
  }

  ctx.setTransform(matrix);

  const hasLabel = isConnectorWithLabel(model);
  let dx = 0;
  let dy = 0;

  if (hasLabel) {
    ctx.save();

    const { deserializedXYWH, labelXYWH } = model as ConnectorElementModel;
    const [x, y, w, h] = deserializedXYWH;
    const [lx, ly, lw, lh] = labelXYWH!;
    const offset = DEFAULT_ARROW_SIZE * strokeWidth;

    dx = lx - x;
    dy = ly - y;

    const path = new Path2D();
    path.rect(-offset / 2, -offset / 2, w + offset, h + offset);
    path.rect(dx - 3 - 0.5, dy - 3 - 0.5, lw + 6 + 1, lh + 6 + 1);
    ctx.clip(path, 'evenodd');
  }

  const strokeColor = renderer.getColorValue(
    model.stroke,
    DefaultTheme.connectorColor,
    true
  );

  renderPoints(
    model,
    ctx,
    rc,
    points,
    strokeStyle,
    mode === ConnectorMode.Curve,
    mode === ConnectorMode.Rounded,
    strokeColor
  );
  renderEndpoint(
    model,
    points,
    ctx,
    rc,
    'Front',
    frontEndpointStyle,
    strokeColor
  );
  renderEndpoint(
    model,
    points,
    ctx,
    rc,
    'Rear',
    rearEndpointStyle,
    strokeColor
  );

  if (hasLabel) {
    ctx.restore();

    renderLabel(
      model as ConnectorElementModel,
      ctx,
      matrix.translate(dx, dy),
      renderer
    );
  }
};

export const ConnectorElementRendererExtension = ElementRendererExtension(
  'connector',
  connector
);

function renderPoints(
  model: ConnectorElementModel | LocalConnectorElementModel,
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  points: PointLocation[],
  strokeStyle: StrokeStyle,
  curve: boolean,
  rounded: boolean,
  stroke: string
) {
  const { seed, strokeWidth, roughness, rough } = model;
  // jumpStyle and jumpSize only exist on ConnectorElementModel, not LocalConnectorElementModel
  const jumpStyle: JumpStyle =
    'jumpStyle' in model ? (model.jumpStyle as JumpStyle) : 'none';
  const jumpSize: number =
    'jumpSize' in model ? (model.jumpSize as number) : 10;
  // cornerRadius only exists on ConnectorElementModel, not LocalConnectorElementModel
  const cornerRadius = resolveConnectorCornerRadius(model);

  if (rough) {
    const options = {
      seed,
      roughness,
      stroke,
      strokeLineDash:
        strokeStyle === StrokeStyle.Dash
          ? [12, 12]
          : strokeStyle === StrokeStyle.Dot
            ? [0, strokeWidth * 2.5]
            : undefined,
      strokeWidth,
    };
    if (curve) {
      const b = getBezierParameters(points);
      rc.path(
        `M${b[0][0]},${b[0][1]} C${b[1][0]},${b[1][1]} ${b[2][0]},${b[2][1]} ${b[3][0]},${b[3][1]}`,
        options
      );
    } else {
      // TODO: roughjs doesn't support arcTo, so rounded corners are not supported in rough mode
      rc.linearPath(points as unknown as [number, number][], options);
    }
  } else {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (strokeStyle === StrokeStyle.Dash) {
      ctx.setLineDash([12, 12]);
    } else if (strokeStyle === StrokeStyle.Dot) {
      ctx.setLineDash([0, strokeWidth * 2.5]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    if (curve) {
      points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point[0], point[1]);
        } else {
          const last = points[index - 1];
          ctx.bezierCurveTo(
            last.absOut[0],
            last.absOut[1],
            point.absIn[0],
            point.absIn[1],
            point[0],
            point[1]
          );
        }
      });
    } else if (
      !curve &&
      jumpStyle !== 'none' &&
      'routedPoints' in model &&
      model.routedPoints &&
      model.routedPoints.length > 0
    ) {
      // Jump rendering uses routed points (absolute). Convert to local coords.
      const baseX = 'x' in model ? (model.x as number) : 0;
      const baseY = 'y' in model ? (model.y as number) : 0;
      const localRoutedPoints = model.routedPoints.map(pt => ({
        type: pt.type,
        x: pt.x - baseX,
        y: pt.y - baseY,
      }));

      if (rounded) {
        renderRoundedJumps(
          ctx,
          localRoutedPoints,
          jumpStyle,
          jumpSize,
          strokeWidth,
          cornerRadius
        );
        ctx.stroke();
      } else {
        const pathData = createConnectorPathWithJumps(
          localRoutedPoints,
          jumpStyle,
          jumpSize,
          strokeWidth,
          rounded,
          cornerRadius
        );
        ctx.stroke(new Path2D(pathData));
      }
      ctx.closePath();
      ctx.restore();
      return;
    } else if (rounded && points.length > 2) {
      // Render path with rounded corners at bend points
      const radius = cornerRadius ?? DEFAULT_CONNECTOR_CORNER_RADIUS;
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        const len1 = Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);
        const len2 = Math.hypot(next[0] - curr[0], next[1] - curr[1]);

        if (len1 < 0.001 || len2 < 0.001) {
          ctx.lineTo(curr[0], curr[1]);
          continue;
        }

        const r = Math.min(radius, len1 / 2, len2 / 2);
        const v1x = (curr[0] - prev[0]) / len1;
        const v1y = (curr[1] - prev[1]) / len1;
        const v2x = (next[0] - curr[0]) / len2;
        const v2y = (next[1] - curr[1]) / len2;
        const startX = curr[0] - v1x * r;
        const startY = curr[1] - v1y * r;
        const endX = curr[0] + v2x * r;
        const endY = curr[1] + v2y * r;

        // Draw to the start of the corner rounding.
        ctx.lineTo(startX, startY);

        if (r < radius) {
          // When the segments are too short for a circular arc, use a
          // quadratic spline to keep the corner smooth and consistent.
          ctx.quadraticCurveTo(curr[0], curr[1], endX, endY);
        } else {
          // Use arcTo to create a circular rounded corner.
          ctx.arcTo(curr[0], curr[1], next[0], next[1], r);
        }
      }
      // Line to the last point
      const lastPoint = points[points.length - 1];
      ctx.lineTo(lastPoint[0], lastPoint[1]);
    } else {
      points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point[0], point[1]);
        } else {
          ctx.lineTo(point[0], point[1]);
        }
      });
    }
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }
}

function renderRoundedJumps(
  ctx: CanvasRenderingContext2D,
  routedPoints: Array<{ type: 0 | 1; x: number; y: number }>,
  jumpStyle: JumpStyle,
  jumpSize: number,
  strokeWidth: number,
  cornerRadius: number
) {
  const size = (jumpSize - 2) / 2 + strokeWidth;
  const gapOffset = Math.max(strokeWidth, size * 0.2);
  let currentSegment: Array<{ x: number; y: number }> = [];

  if (routedPoints.length > 0) {
    currentSegment.push({ x: routedPoints[0].x, y: routedPoints[0].y });
  }

  const flushSegment = () => {
    if (currentSegment.length < 2) {
      currentSegment = [];
      return;
    }
    ctx.moveTo(currentSegment[0].x, currentSegment[0].y);
    for (let i = 1; i < currentSegment.length - 1; i++) {
      const prev = currentSegment[i - 1];
      const curr = currentSegment[i];
      const next = currentSegment[i + 1];
      const len1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const len2 = Math.hypot(next.x - curr.x, next.y - curr.y);
      if (len1 < 0.001 || len2 < 0.001) {
        ctx.lineTo(curr.x, curr.y);
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
      ctx.lineTo(startX, startY);
      if (r < cornerRadius) {
        ctx.quadraticCurveTo(curr.x, curr.y, endX, endY);
      } else {
        ctx.arcTo(curr.x, curr.y, next.x, next.y, r);
      }
    }
    const last = currentSegment[currentSegment.length - 1];
    ctx.lineTo(last.x, last.y);
    currentSegment = [];
  };

  for (let i = 0; i < routedPoints.length - 1; i++) {
    const current = routedPoints[i];
    const next = routedPoints[i + 1];

    if (next.type === 1) {
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
        const gap0x = p0x - (dx / len) * gapOffset;
        const gap0y = p0y - (dy / len) * gapOffset;
        const gap1x = p1x + (dx / len) * gapOffset;
        const gap1y = p1y + (dy / len) * gapOffset;
        const f =
          Math.round(nx) < 0 || (Math.round(nx) === 0 && Math.round(ny) <= 0)
            ? 1
            : -1;

        currentSegment.push({ x: gap0x, y: gap0y });
        flushSegment();

        if (jumpStyle === 'arc') {
          const arcF = f * 1.3;
          ctx.lineTo(gap0x, gap0y);
          ctx.moveTo(p0x, p0y);
          ctx.bezierCurveTo(
            p0x - ny * arcF,
            p0y + nx * arcF,
            p1x - ny * arcF,
            p1y + nx * arcF,
            p1x,
            p1y
          );
          ctx.moveTo(gap1x, gap1y);
          currentSegment.push({ x: gap1x, y: gap1y });
          continue;
        }

        switch (jumpStyle) {
          case 'sharp':
            ctx.lineTo(gap0x, gap0y);
            ctx.moveTo(p0x, p0y);
            ctx.lineTo(p0x - ny * f, p0y + nx * f);
            ctx.lineTo(p1x - ny * f, p1y + nx * f);
            ctx.lineTo(p1x, p1y);
            ctx.moveTo(gap1x, gap1y);
            break;
          case 'line':
            ctx.lineTo(gap0x, gap0y);
            ctx.moveTo(p0x, p0y);
            ctx.moveTo(p0x + ny * f, p0y - nx * f);
            ctx.lineTo(p0x - ny * f, p0y + nx * f);
            ctx.moveTo(p1x - ny * f, p1y + nx * f);
            ctx.lineTo(p1x + ny * f, p1y - nx * f);
            ctx.moveTo(gap1x, gap1y);
            break;
          case 'gap':
            ctx.lineTo(gap0x, gap0y);
            ctx.moveTo(gap1x, gap1y);
            break;
          default:
            ctx.lineTo(next.x, next.y);
            break;
        }

        currentSegment.push({ x: gap1x, y: gap1y });
      }
    } else {
      currentSegment.push({ x: next.x, y: next.y });
    }
  }

  if (currentSegment.length > 1) {
    flushSegment();
  }
}

function renderEndpoint(
  model: ConnectorElementModel | LocalConnectorElementModel,
  location: PointLocation[],
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  end: 'Front' | 'Rear',
  style: PointStyle,
  stroke: string
) {
  const arrowOptions = getArrowOptions(end, model, stroke);

  switch (style) {
    case 'None':
      return;
    case 'Arrow':
      renderArrow(location, ctx, rc, arrowOptions);
      break;
    case 'Triangle':
      renderTriangle(location, ctx, rc, arrowOptions);
      break;
    case 'Circle':
      renderCircle(location, ctx, rc, arrowOptions);
      break;
    case 'Diamond':
      renderDiamond(location, ctx, rc, arrowOptions);
      break;
    default:
      renderDrawioMarker(location, ctx, arrowOptions, style);
      break;
  }
}

function renderLabel(
  model: ConnectorElementModel,
  ctx: CanvasRenderingContext2D,
  matrix: DOMMatrix,
  renderer: CanvasRenderer
) {
  const {
    text,
    labelXYWH,
    labelStyle: {
      color,
      fontSize,
      fontWeight,
      fontStyle,
      fontFamily,
      textAlign,
    },
    labelConstraints: { hasMaxWidth, maxWidth },
  } = model;
  const font = getFontString({
    fontStyle,
    fontWeight,
    fontSize,
    fontFamily,
  });
  const [, , w, h] = labelXYWH!;
  const cx = w / 2;
  const cy = h / 2;

  ctx.setTransform(matrix);

  if (renderer.usePlaceholder) {
    ctx.fillStyle = getAffinePlaceholderFillColor(renderer.getColorScheme());
    ctx.fillRect(0, 0, w, h);
    return; // Skip actual label rendering
  }

  const deltas = wrapTextDeltas(text!, font, w);
  const lines = deltaInsertsToChunks(deltas);
  const lineHeight = getLineHeight(fontFamily, fontSize, fontWeight);
  const textHeight = (lines.length - 1) * lineHeight * 0.5;

  ctx.font = font;
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = renderer.getColorValue(color, DefaultTheme.black, true);

  let textMaxWidth = textAlign === 'center' ? 0 : getMaxTextWidth(lines, font);
  if (hasMaxWidth && maxWidth > 0) {
    textMaxWidth = Math.min(textMaxWidth, textMaxWidth);
  }

  for (const [index, line] of lines.entries()) {
    for (const delta of line) {
      const str = delta.insert;
      const rtl = isRTL(str);
      const shouldTemporarilyAttach = rtl && !ctx.canvas.isConnected;
      if (shouldTemporarilyAttach) {
        // to correctly render RTL text mixed with LTR, we have to append it
        // to the DOM
        document.body.append(ctx.canvas);
      }

      ctx.canvas.setAttribute('dir', rtl ? 'rtl' : 'ltr');

      const x =
        textMaxWidth *
        (textAlign === 'center'
          ? 1
          : textAlign === 'right'
            ? rtl
              ? -0.5
              : 0.5
            : rtl
              ? 0.5
              : -0.5);
      ctx.fillText(str, x + cx, index * lineHeight - textHeight + cy);

      if (shouldTemporarilyAttach) {
        ctx.canvas.remove();
      }
    }
  }
}

function getMaxTextWidth(lines: TextDelta[][], font: string) {
  return Math.max(
    ...lines.flatMap(line =>
      line.map(delta => getTextWidth(delta.insert, font))
    )
  );
}
