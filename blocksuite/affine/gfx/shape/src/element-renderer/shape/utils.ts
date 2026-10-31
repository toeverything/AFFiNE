import type { CanvasRenderer } from '@blocksuite/affine-block-surface';
import {
  getFontString,
  getLineHeight,
  getLineWidth,
  getTextWidth,
  measureTextInDOM,
  type TextDelta,
  wrapText,
  wrapTextDeltas,
} from '@blocksuite/affine-gfx-text';
import type {
  LocalShapeElementModel,
  ShapeElementModel,
  TextAlign,
  TextVerticalAlign,
} from '@blocksuite/affine-model';
import { ShapeType } from '@blocksuite/affine-model';
import { FeatureFlagService } from '@blocksuite/affine-shared/services';
import type { Bound, SerializedXYWH } from '@blocksuite/global/gfx';
import { deltaInsertsToChunks } from '@blocksuite/std/inline';

import { buildCubePath, buildDocumentPath } from './paths.js';

export type Colors = {
  color: string;
  fillColor: string;
  strokeColor: string;
};

export function getStrokeLineDash(
  strokeStyle: string,
  strokeWidth: number
): number[] | undefined {
  switch (strokeStyle) {
    case 'dash':
      return [12, 12];
    case 'dot':
      // Use a short dash to render dots, matching drawGeneralShape's dotted style.
      return [Math.max(1, strokeWidth), strokeWidth * 2.5];
    default:
      return undefined;
  }
}

const gradientDirectionMap: Record<
  NonNullable<ShapeElementModel['gradientDirection']>,
  [number, number, number, number]
> = {
  S: [0, 0, 0, 1],
  W: [1, 0, 0, 0],
  N: [0, 1, 0, 0],
  E: [0, 0, 1, 0],
  SE: [0, 0, 1, 1],
  SW: [1, 0, 0, 1],
  NE: [0, 1, 1, 0],
  NW: [1, 1, 0, 0],
};

export const resolveGradientFill = (
  ctx: CanvasRenderingContext2D,
  renderer: CanvasRenderer,
  model: ShapeElementModel | LocalShapeElementModel,
  fillColor: string,
  width: number,
  height: number
) => {
  const gradientFinal =
    'gradientFinal' in model ? model.gradientFinal : undefined;
  if (!gradientFinal) return fillColor;
  const gradientFinalColor = renderer.getColorValue(
    gradientFinal,
    fillColor,
    true
  );
  if (gradientFinalColor === fillColor) return fillColor;
  const direction =
    'gradientDirection' in model && model.gradientDirection
      ? model.gradientDirection
      : 'S';
  const [x0, y0, x1, y1] = gradientDirectionMap[direction];
  const gradient = ctx.createLinearGradient(
    x0 * width,
    y0 * height,
    x1 * width,
    y1 * height
  );
  try {
    gradient.addColorStop(0, fillColor);
    gradient.addColorStop(1, gradientFinalColor);
  } catch {
    return fillColor;
  }
  return gradient;
};

export function drawGeneralShape(
  ctx: CanvasRenderingContext2D,
  shapeModel: ShapeElementModel | LocalShapeElementModel,
  renderer: CanvasRenderer,
  filled: boolean,
  fillColor: string,
  strokeColor: string
) {
  const sizeOffset = Math.max(shapeModel.strokeWidth, 0);
  const w = Math.max(shapeModel.w - sizeOffset, 0);
  const h = Math.max(shapeModel.h - sizeOffset, 0);

  if (
    shapeModel.shapeType === ShapeType.Document ||
    shapeModel.shapeType === ShapeType.Cube
  ) {
    const path = new Path2D(
      shapeModel.shapeType === ShapeType.Document
        ? buildDocumentPath(w, h)
        : buildCubePath(w, h)
    );

    ctx.lineWidth = shapeModel.strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = filled
      ? resolveGradientFill(ctx, renderer, shapeModel, fillColor, w, h)
      : 'transparent';

    switch (shapeModel.strokeStyle) {
      case 'none':
        ctx.strokeStyle = 'transparent';
        break;
      case 'dash':
        ctx.setLineDash([12, 12]);
        break;
      case 'dot':
        ctx.lineCap = 'round';
        ctx.setLineDash([
          Math.max(1, shapeModel.strokeWidth),
          shapeModel.strokeWidth * 2.5,
        ]);
        break;
      default:
        ctx.setLineDash([]);
    }

    ctx.fill(path);
    ctx.stroke(path);
    return;
  }

  switch (shapeModel.shapeType) {
    case 'rect':
      drawRect(ctx, 0, 0, w, h, shapeModel.radius ?? 0);
      break;
    case 'diamond':
      drawDiamond(ctx, 0, 0, w, h);
      break;
    case 'ellipse':
      drawEllipse(ctx, 0, 0, w, h);
      break;
    case 'triangle':
      drawTriangle(ctx, 0, 0, w, h);
      break;
    case 'triangleRight':
      drawTriangleRight(ctx, 0, 0, w, h);
      break;
    case 'hexagon':
      drawHexagon(ctx, 0, 0, w, h);
      break;
    case 'parallelogram':
      drawParallelogram(ctx, 0, 0, w, h);
      break;
    case 'trapezoid':
      drawTrapezoid(ctx, 0, 0, w, h);
      break;
    case 'step':
      drawStep(ctx, 0, 0, w, h);
      break;
    case 'cylinder':
      drawCylinder(ctx, 0, 0, w, h);
      break;
    case 'cloud':
      drawCloud(ctx, 0, 0, w, h);
      break;
    case 'note':
      drawNote(ctx, 0, 0, w, h);
      break;
    case 'callout':
      drawCallout(ctx, 0, 0, w, h);
      break;
    case 'actor':
      drawActor(ctx, 0, 0, w, h);
      break;
    case 'dataStorage':
      drawDataStorage(ctx, 0, 0, w, h);
      break;
    case 'tape':
      drawTape(ctx, 0, 0, w, h);
      break;
    case 'internalStorage':
      drawInternalStorage(ctx, 0, 0, w, h);
      break;
    case 'logicAnd':
      drawLogicAnd(ctx, 0, 0, w, h);
      break;
    case 'logicOr':
      drawLogicOr(ctx, 0, 0, w, h);
      break;
  }

  ctx.lineWidth = shapeModel.strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = filled
    ? resolveGradientFill(ctx, renderer, shapeModel, fillColor, w, h)
    : 'transparent';

  switch (shapeModel.strokeStyle) {
    case 'none':
      ctx.strokeStyle = 'transparent';
      break;
    case 'dash':
      ctx.setLineDash([12, 12]);
      break;
    case 'dot':
      // Use a short dash with round caps to render dots.
      ctx.lineCap = 'round';
      ctx.setLineDash([
        Math.max(1, shapeModel.strokeWidth),
        shapeModel.strokeWidth * 2.5,
      ]);
      break;
  }

  if (shapeModel.shadow) {
    const { blur, offsetX, offsetY, color } = shapeModel.shadow;
    const scale = ctx.getTransform().a;

    const enableShadowBlur = shapeModel.surface.store
      .get(FeatureFlagService)
      .getFlag('enable_shape_shadow_blur');

    // hard shadow, or soft shadow if `enable_shape_shadow_blur` is true
    // see comment of `shape.shadow` in `ShapeElementModel`
    if (blur === 0 || enableShadowBlur) {
      ctx.shadowBlur = blur * scale;
      ctx.shadowOffsetX = offsetX * scale;
      ctx.shadowOffsetY = offsetY * scale;
    }

    ctx.shadowColor = renderer.getColorValue(color, undefined, true);
  }

  ctx.stroke();
  ctx.fill();

  if (shapeModel.shadow) {
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.fill();
  ctx.stroke();
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r =
    radius < 1
      ? Math.max(Math.min(width * radius, height * radius), 0)
      : radius;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  ctx.beginPath();
  ctx.moveTo(width / 2, y);
  ctx.lineTo(width, height / 2);
  ctx.lineTo(width / 2, height);
  ctx.lineTo(x, height / 2);
  ctx.closePath();
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  _x: number,
  _y: number,
  width: number,
  height: number
) {
  const cx = width / 2;
  const cy = height / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, width / 2, height / 2, 0, 0, 2 * Math.PI);
  ctx.closePath();
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  ctx.beginPath();
  ctx.moveTo(width / 2, y);
  ctx.lineTo(width, height);
  ctx.lineTo(x, height);
  ctx.closePath();
}

function drawTriangleRight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y + height / 2);
  ctx.lineTo(x, y + height);
  ctx.closePath();
}

function drawHexagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  ctx.beginPath();
  ctx.moveTo(x + width * 0.25, y);
  ctx.lineTo(x + width * 0.75, y);
  ctx.lineTo(x + width, y + height / 2);
  ctx.lineTo(x + width * 0.75, y + height);
  ctx.lineTo(x + width * 0.25, y + height);
  ctx.lineTo(x, y + height / 2);
  ctx.closePath();
}

function drawParallelogram(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const offset = Math.min(width * 0.2, width / 2);

  ctx.beginPath();
  ctx.moveTo(x + offset, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width - offset, y + height);
  ctx.lineTo(x, y + height);
  ctx.closePath();
}

function drawTrapezoid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const offset = Math.min(width * 0.2, width / 2);

  ctx.beginPath();
  ctx.moveTo(x + offset, y);
  ctx.lineTo(x + width - offset, y);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.closePath();
}

function drawStep(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const size = width * 0.2;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width - size, y);
  ctx.lineTo(x + width, y + height / 2);
  ctx.lineTo(x + width - size, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x + size, y + height / 2);
  ctx.closePath();
}

function drawCylinderShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  heightRatio: number,
  widthRatio: number
) {
  const rx = width / 2;
  const ry = Math.min(height * heightRatio, width * widthRatio);
  const topY = y + ry;
  const bottomY = y + height - ry;

  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.ellipse(x + rx, topY, rx, ry, 0, Math.PI, 0);
  ctx.lineTo(x + width, bottomY);
  ctx.ellipse(x + rx, bottomY, rx, ry, 0, 0, Math.PI);
  ctx.closePath();

  ctx.moveTo(x + rx, topY);
  ctx.ellipse(x + rx, topY, rx, ry, 0, 0, Math.PI * 2);
}

function drawCylinder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  drawCylinderShape(ctx, x, y, width, height, 0.18, 0.25);
}

function drawCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const cy = y + height * 0.55;
  const r = Math.min(width, height) * 0.18;

  ctx.beginPath();
  ctx.moveTo(x + width * 0.18, cy + r * 0.6);
  ctx.bezierCurveTo(
    x + width * 0.05,
    cy + r * 0.4,
    x + width * 0.05,
    cy - r * 0.6,
    x + width * 0.22,
    cy - r * 0.6
  );
  ctx.bezierCurveTo(
    x + width * 0.25,
    y + height * 0.2,
    x + width * 0.38,
    y + height * 0.05,
    x + width * 0.52,
    y + height * 0.18
  );
  ctx.bezierCurveTo(
    x + width * 0.62,
    y + height * 0.02,
    x + width * 0.8,
    y + height * 0.12,
    x + width * 0.8,
    y + height * 0.3
  );
  ctx.bezierCurveTo(
    x + width * 0.95,
    y + height * 0.35,
    x + width * 0.95,
    cy + r * 0.4,
    x + width * 0.82,
    cy + r * 0.5
  );
  ctx.bezierCurveTo(
    x + width * 0.78,
    y + height * 0.9,
    x + width * 0.6,
    y + height * 0.92,
    x + width * 0.5,
    y + height * 0.82
  );
  ctx.bezierCurveTo(
    x + width * 0.4,
    y + height * 0.95,
    x + width * 0.22,
    y + height * 0.92,
    x + width * 0.2,
    cy + r * 0.7
  );
  ctx.closePath();
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const fold = Math.min(width, height) * 0.2;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width - fold, y);
  ctx.lineTo(x + width, y + fold);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.closePath();

  ctx.moveTo(x + width - fold, y);
  ctx.lineTo(x + width - fold, y + fold);
  ctx.lineTo(x + width, y + fold);
}

function drawCallout(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const tailY = y + height * 0.75;
  const tailX = x + width * 0.5;
  const tailWidth = width * 0.2;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, tailY);
  ctx.lineTo(tailX + tailWidth / 2, tailY);
  ctx.lineTo(tailX, y + height);
  ctx.lineTo(tailX - tailWidth / 2, tailY);
  ctx.lineTo(x, tailY);
  ctx.closePath();
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const headR = Math.min(width, height) * 0.15;
  const headCx = x + width / 2;
  const headCy = y + headR + height * 0.05;
  const bodyTop = headCy + headR;
  const bodyBottom = y + height * 0.72;
  const armY = y + height * 0.45;
  const armSpan = width * 0.35;
  const legSpan = width * 0.2;

  ctx.beginPath();
  ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
  ctx.moveTo(headCx, bodyTop);
  ctx.lineTo(headCx, bodyBottom);
  ctx.moveTo(headCx - armSpan, armY);
  ctx.lineTo(headCx + armSpan, armY);
  ctx.moveTo(headCx, bodyBottom);
  ctx.lineTo(headCx - legSpan, y + height);
  ctx.moveTo(headCx, bodyBottom);
  ctx.lineTo(headCx + legSpan, y + height);
}

function drawDataStorage(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  drawCylinderShape(ctx, x, y, width, height, 0.12, 0.2);
}

function drawTape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const curve = height * 0.2;

  ctx.beginPath();
  ctx.moveTo(x, y + curve);
  ctx.quadraticCurveTo(x + width * 0.25, y, x + width * 0.5, y + curve);
  ctx.quadraticCurveTo(x + width * 0.75, y + curve * 2, x + width, y + curve);
  ctx.lineTo(x + width, y + height - curve);
  ctx.quadraticCurveTo(
    x + width * 0.75,
    y + height,
    x + width * 0.5,
    y + height - curve
  );
  ctx.quadraticCurveTo(
    x + width * 0.25,
    y + height - curve * 2,
    x,
    y + height - curve
  );
  ctx.closePath();
}

function drawInternalStorage(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const inset = width * 0.15;

  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.moveTo(x + inset, y);
  ctx.lineTo(x + inset, y + height);
  ctx.moveTo(x, y + height * 0.25);
  ctx.lineTo(x + width, y + height * 0.25);
}

function drawLogicAnd(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const r = height / 2;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width - r, y);
  ctx.arc(x + width - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x, y + height);
  ctx.closePath();
}

function drawLogicOr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(
    x + width * 0.45,
    y + height * 0.05,
    x + width * 0.7,
    y + height / 2
  );
  ctx.quadraticCurveTo(x + width * 0.45, y + height * 0.95, x, y + height);
  ctx.quadraticCurveTo(x + width * 0.2, y + height * 0.5, x, y);
  ctx.closePath();
}

export function horizontalOffset(
  width: number,
  textAlign: TextAlign,
  horiPadding: number
) {
  return textAlign === 'center'
    ? width / 2
    : textAlign === 'right'
      ? width - horiPadding
      : horiPadding;
}

export function verticalOffset(
  lines: TextDelta[][],
  lineHeight: number,
  height: number,
  textVerticalAlign: TextVerticalAlign,
  verticalPadding: number
) {
  return textVerticalAlign === 'center'
    ? Math.max((height - lineHeight * lines.length) / 2, verticalPadding)
    : textVerticalAlign === 'top'
      ? verticalPadding
      : height - lineHeight * lines.length - verticalPadding;
}
export function normalizeShapeBound(
  shape: ShapeElementModel,
  bound: Bound
): Bound {
  if (!shape.text) return bound;

  const [verticalPadding, horiPadding] = shape.padding;
  const yText = shape.text;
  const { fontFamily, fontSize, fontStyle, fontWeight } = shape;
  const lineHeight = getLineHeight(fontFamily, fontSize, fontWeight);
  const font = getFontString({
    fontStyle,
    fontWeight,
    fontSize,
    fontFamily,
  });
  const widestCharWidth =
    [...yText.toString()]
      .map(char => getTextWidth(char, font))
      .sort((a, b) => a - b)
      .pop() ?? getTextWidth('W', font);

  if (bound.w < widestCharWidth + horiPadding * 2) {
    bound.w = widestCharWidth + horiPadding * 2;
  }
  const deltas: TextDelta[] = (yText.toDelta() as TextDelta[]).flatMap(
    delta => ({
      insert: wrapText(delta.insert, font, bound.w - horiPadding * 2),
      attributes: delta.attributes,
    })
  ) as TextDelta[];
  const lines = deltaInsertsToChunks(deltas);

  if (bound.h < lineHeight * lines.length + verticalPadding * 2) {
    bound.h = lineHeight * lines.length + verticalPadding * 2;
  }

  return bound;
}

export function fitContent(shape: ShapeElementModel) {
  const font = getFontString(shape);

  if (!shape.text) {
    return;
  }

  const [verticalPadding, horiPadding] = shape.padding;
  const lines = deltaInsertsToChunks(
    wrapTextDeltas(shape.text, font, shape.maxWidth || Number.MAX_SAFE_INTEGER)
  );
  const { lineHeight, lineGap } = measureTextInDOM(
    shape.fontFamily,
    shape.fontSize,
    shape.fontWeight
  );
  let maxWidth = 0;
  let height = 0;

  lines.forEach(line => {
    for (const delta of line) {
      const str = delta.insert;

      maxWidth = Math.max(maxWidth, getLineWidth(str, font));
    }
    height += lineHeight + lineGap;
  });

  height = Math.max(lineHeight + lineGap, height);

  maxWidth += horiPadding * 2;
  height += verticalPadding * 2;

  const newXYWH = `[${shape.x},${shape.y},${maxWidth},${height}]`;

  if (shape.xywh !== newXYWH) {
    shape.xywh = newXYWH as SerializedXYWH;
  }
}
