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
  DefaultTheme,
  type LocalConnectorElementModel,
  type PointStyle,
} from '@blocksuite/affine-model';
import {
  getBezierParameters,
  type PointLocation,
} from '@blocksuite/global/gfx';
import { deltaInsertsToChunks } from '@blocksuite/std/inline';

import { isConnectorWithLabel } from '../connector-manager';
import {
  DEFAULT_ARROW_SIZE,
  getArrowOptions,
  renderArrow,
  renderCircle,
  renderDiamond,
  renderTriangle,
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
    strokeStyle === 'dash',
    mode === ConnectorMode.Curve,
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
  dash: boolean,
  curve: boolean,
  stroke: string
) {
  const { seed, strokeWidth, roughness, rough } = model;

  if (rough) {
    const options = {
      seed,
      roughness,
      stroke,
      strokeLineDash: dash ? [12, 12] : undefined,
      strokeWidth,
    };
    if (curve) {
      const b = getBezierParameters(points);
      rc.path(
        `M${b[0][0]},${b[0][1]} C${b[1][0]},${b[1][1]} ${b[2][0]},${b[2][1]} ${b[3][0]},${b[3][1]}`,
        options
      );
    } else {
      rc.linearPath(points as unknown as [number, number][], options);
    }
  } else {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    dash && ctx.setLineDash([12, 12]);
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
    ctx.fillStyle = 'rgba(200, 200, 200, 0.5)';
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
