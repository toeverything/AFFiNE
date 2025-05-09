import {
  type ElementRenderer,
  ElementRendererExtension,
} from '@blocksuite/affine-block-surface';
import { DefaultTheme, type TextElementModel } from '@blocksuite/affine-model';
import { deltaInsertsToChunks } from '@blocksuite/std/inline';

import {
  getFontString,
  getLineHeight,
  getTextWidth,
  isRTL,
  wrapTextDeltas,
} from './utils.js';

export const text: ElementRenderer<TextElementModel> = (
  model,
  ctx,
  matrix,
  renderer
) => {
  const { fontSize, fontWeight, fontStyle, fontFamily, textAlign, rotate } =
    model;
  const [, , w, h] = model.deserializedXYWH;
  const cx = w / 2;
  const cy = h / 2;

  ctx.setTransform(
    matrix.translateSelf(cx, cy).rotateSelf(rotate).translateSelf(-cx, -cy)
  );

  // const deltas: ITextDelta[] = yText.toDelta() as ITextDelta[];
  const font = getFontString({
    fontStyle,
    fontWeight,
    fontSize,
    fontFamily,
  });
  const deltas = wrapTextDeltas(model.text, font, w);
  const lines = deltaInsertsToChunks(deltas);
  const lineHeightPx = getLineHeight(fontFamily, fontSize, fontWeight);
  const horizontalOffset =
    textAlign === 'center' ? w / 2 : textAlign === 'right' ? w : 0;

  const color = renderer.getColorValue(
    model.color,
    DefaultTheme.textColor,
    true
  );

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'ideographic';

  for (const [lineIndex, line] of lines.entries()) {
    let beforeTextWidth = 0;

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

      // 0.5 comes from v-line padding
      const offset =
        textAlign === 'center' ? 0 : textAlign === 'right' ? -0.5 : 0.5;
      ctx.fillText(
        str,
        horizontalOffset + beforeTextWidth + offset,
        (lineIndex + 1) * lineHeightPx
      );

      beforeTextWidth += getTextWidth(str, font);

      if (shouldTemporarilyAttach) {
        ctx.canvas.remove();
      }
    }
  }
};

export const TextElementRendererExtension = ElementRendererExtension(
  'text',
  text
);

export * from './utils';
