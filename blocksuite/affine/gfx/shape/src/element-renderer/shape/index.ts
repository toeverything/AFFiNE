import {
  type CanvasRenderer,
  type ElementRenderer,
  ElementRendererExtension,
  type RoughCanvas,
} from '@blocksuite/affine-block-surface';
import {
  getFontMetrics,
  getFontString,
  getLineWidth,
  isRTL,
  measureTextInDOM,
  wrapTextDeltas,
} from '@blocksuite/affine-gfx-text';
import type {
  LocalShapeElementModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';
import { DefaultTheme, ShapeType, TextAlign } from '@blocksuite/affine-model';
import type { IBound } from '@blocksuite/global/gfx';
import { Bound } from '@blocksuite/global/gfx';
import { deltaInsertsToChunks } from '@blocksuite/std/inline';

import { DRAWIO_STENCIL_SHAPE_MAP } from '../../drawio/stencil-map.js';
import { getStencilShapeData } from '../../drawio/stencil-utils.js';
import { actor } from './actor.js';
import { cloud } from './cloud.js';
import { cube } from './cube.js';
import { diamond } from './diamond.js';
import { document as documentShape } from './document.js';
import { ellipse } from './ellipse.js';
import { hexagon } from './hexagon.js';
import { note } from './note.js';
import { parallelogram } from './parallelogram.js';
import { rect } from './rect.js';
import { createStencilShapeRenderer } from './stencil-shape.js';
import { step } from './step.js';
import { trapezoid } from './trapezoid.js';
import { triangle } from './triangle.js';
import { triangleRight } from './triangle-right.js';
import { type Colors, horizontalOffset, verticalOffset } from './utils.js';

const shapeRenderers: Record<
  ShapeType,
  (
    model: ShapeElementModel | LocalShapeElementModel,
    ctx: CanvasRenderingContext2D,
    matrix: DOMMatrix,
    renderer: CanvasRenderer,
    rc: RoughCanvas,
    colors: Colors
  ) => void
> = {
  ...(() => {
    const resolveStencil = (shapeType: ShapeType) => {
      const name = DRAWIO_STENCIL_SHAPE_MAP[shapeType];
      const stencil = name ? getStencilShapeData(name) : null;
      return stencil ? createStencilShapeRenderer(stencil) : rect;
    };

    return {
      callout: resolveStencil(ShapeType.Callout),
      cylinder: resolveStencil(ShapeType.Cylinder),
      dataStorage: resolveStencil(ShapeType.DataStorage),
      internalStorage: resolveStencil(ShapeType.InternalStorage),
      tape: resolveStencil(ShapeType.Tape),
      logicAnd: resolveStencil(ShapeType.LogicAnd),
      logicOr: resolveStencil(ShapeType.LogicOr),
      flowchartProcess: resolveStencil(ShapeType.FlowchartProcess),
      flowchartDecision: resolveStencil(ShapeType.FlowchartDecision),
      flowchartData: resolveStencil(ShapeType.FlowchartData),
      flowchartDocument: resolveStencil(ShapeType.FlowchartDocument),
      flowchartManualInput: resolveStencil(ShapeType.FlowchartManualInput),
      flowchartDelay: resolveStencil(ShapeType.FlowchartDelay),
      flowchartPredefinedProcess: resolveStencil(
        ShapeType.FlowchartPredefinedProcess
      ),
      flowchartStoredData: resolveStencil(ShapeType.FlowchartStoredData),
      flowchartInternalStorage: resolveStencil(
        ShapeType.FlowchartInternalStorage
      ),
      flowchartDatabase: resolveStencil(ShapeType.FlowchartDatabase),
      flowchartSequentialData: resolveStencil(
        ShapeType.FlowchartSequentialData
      ),
      flowchartTerminator: resolveStencil(ShapeType.FlowchartTerminator),
      flowchartPreparation: resolveStencil(ShapeType.FlowchartPreparation),
      flowchartMerge: resolveStencil(ShapeType.FlowchartMerge),
      flowchartPaperTape: resolveStencil(ShapeType.FlowchartPaperTape),
      flowchartAnnotation1: resolveStencil(ShapeType.FlowchartAnnotation1),
      flowchartAnnotation2: resolveStencil(ShapeType.FlowchartAnnotation2),
      flowchartCard: resolveStencil(ShapeType.FlowchartCard),
      flowchartCollate: resolveStencil(ShapeType.FlowchartCollate),
      flowchartDirectData: resolveStencil(ShapeType.FlowchartDirectData),
      flowchartDisplay: resolveStencil(ShapeType.FlowchartDisplay),
      flowchartLoopLimit: resolveStencil(ShapeType.FlowchartLoopLimit),
      flowchartManualOperation: resolveStencil(
        ShapeType.FlowchartManualOperation
      ),
      flowchartMultiDocument: resolveStencil(ShapeType.FlowchartMultiDocument),
      flowchartOffPageReference: resolveStencil(
        ShapeType.FlowchartOffPageReference
      ),
      flowchartOr: resolveStencil(ShapeType.FlowchartOr),
      flowchartSort: resolveStencil(ShapeType.FlowchartSort),
      flowchartSummingFunction: resolveStencil(
        ShapeType.FlowchartSummingFunction
      ),
      arrowUp: resolveStencil(ShapeType.ArrowUp),
      arrowDown: resolveStencil(ShapeType.ArrowDown),
      arrowLeft: resolveStencil(ShapeType.ArrowLeft),
      arrowRight: resolveStencil(ShapeType.ArrowRight),
      arrowTwoWayHorizontal: resolveStencil(ShapeType.ArrowTwoWayHorizontal),
      arrowTwoWayVertical: resolveStencil(ShapeType.ArrowTwoWayVertical),
      arrowBentLeft: resolveStencil(ShapeType.ArrowBentLeft),
      arrowBentRight: resolveStencil(ShapeType.ArrowBentRight),
      arrowBentUp: resolveStencil(ShapeType.ArrowBentUp),
      arrowNotchedSignalIn: resolveStencil(ShapeType.ArrowNotchedSignalIn),
      arrowNotchedRight: resolveStencil(ShapeType.ArrowNotchedRight),
      arrowNotchedStylised: resolveStencil(ShapeType.ArrowNotchedStylised),
      arrowCalloutUp: resolveStencil(ShapeType.ArrowCalloutUp),
      arrowCalloutDouble: resolveStencil(ShapeType.ArrowCalloutDouble),
      arrowCalloutQuad: resolveStencil(ShapeType.ArrowCalloutQuad),
    };
  })(),
  diamond,
  rect,
  triangle,
  ellipse,
  triangleRight,
  hexagon,
  parallelogram,
  trapezoid,
  step,
  cloud,
  document: documentShape,
  note,
  cube,
  actor,
};

export const shape: ElementRenderer<ShapeElementModel> = (
  model,
  ctx,
  matrix,
  renderer,
  rc
) => {
  const color = renderer.getColorValue(
    model.color,
    DefaultTheme.shapeTextColor,
    true
  );
  const fillColor = renderer.getColorValue(
    model.fillColor,
    DefaultTheme.shapeFillColor,
    true
  );
  const strokeColor = renderer.getColorValue(
    model.strokeColor,
    DefaultTheme.shapeStrokeColor,
    true
  );
  const colors = { color, fillColor, strokeColor };

  shapeRenderers[model.shapeType](model, ctx, matrix, renderer, rc, colors);

  if (model.textDisplay) {
    renderText(model, ctx, colors);
  }
};

export const ShapeElementRendererExtension = ElementRendererExtension(
  'shape',
  shape
);

export * from './utils';

function renderText(
  model: ShapeElementModel | LocalShapeElementModel,
  ctx: CanvasRenderingContext2D,
  { color }: Colors
) {
  const {
    x,
    y,
    text,
    fontSize,
    fontFamily,
    fontWeight,
    textAlign,
    w,
    h,
    textVerticalAlign,
    padding,
  } = model;
  if (!text) return;

  const [verticalPadding, horPadding] = padding;
  const flipX = 'flipX' in model ? model.flipX : false;
  const flipY = 'flipY' in model ? model.flipY : false;
  const font = getFontString(model);
  const { lineGap, lineHeight } = measureTextInDOM(
    fontFamily,
    fontSize,
    fontWeight
  );
  const metrics = getFontMetrics(fontFamily, fontSize, fontWeight);
  const lines =
    typeof text === 'string'
      ? [text.split('\n').map(line => ({ insert: line }))]
      : deltaInsertsToChunks(wrapTextDeltas(text, font, w - horPadding * 2));
  const horOffset = horizontalOffset(model.w, model.textAlign, horPadding);
  const vertOffset =
    verticalOffset(
      lines,
      lineHeight + lineGap,
      h,
      textVerticalAlign,
      verticalPadding
    ) +
    metrics.fontBoundingBoxAscent +
    lineGap / 2;
  let maxLineWidth = 0;

  ctx.save();

  if (flipX || flipY) {
    ctx.translate(w / 2, h / 2);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.translate(-w / 2, -h / 2);
  }

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'alphabetic';

  for (const [lineIndex, line] of lines.entries()) {
    for (const delta of line) {
      const str = delta.insert;
      const rtl = isRTL(str);
      const shouldTemporarilyAttach = rtl && !ctx.canvas.isConnected;
      if (shouldTemporarilyAttach) {
        // to correctly render RTL text mixed with LTR, we have to append it
        // to the DOM
        document.body.append(ctx.canvas);
      }

      if (ctx.canvas.dir !== (rtl ? 'rtl' : 'ltr')) {
        ctx.canvas.setAttribute('dir', rtl ? 'rtl' : 'ltr');
      }

      ctx.fillText(
        str,
        // 0.5 is the dom editor padding to make the text align with the DOM text
        horOffset + 0.5,
        lineIndex * lineHeight + vertOffset
      );

      maxLineWidth = Math.max(maxLineWidth, getLineWidth(str, font));

      if (shouldTemporarilyAttach) {
        ctx.canvas.remove();
      }
    }
  }

  const offsetX =
    model.textAlign === TextAlign.Center
      ? (w - maxLineWidth) / 2
      : model.textAlign === TextAlign.Left
        ? horOffset
        : horOffset - maxLineWidth;
  const offsetY = vertOffset - lineHeight + verticalPadding / 2;

  ctx.restore();

  const bound = new Bound(
    x + offsetX,
    y + offsetY,
    maxLineWidth,
    lineHeight * lines.length
  ) as IBound;

  bound.rotate = model.rotate ?? 0;
  model.textBound = bound;
  ctx.restore();
}
