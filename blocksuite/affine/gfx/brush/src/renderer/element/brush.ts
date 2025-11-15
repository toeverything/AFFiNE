import {
  type ElementRenderer,
  ElementRendererExtension,
} from '@blocksuite/affine-block-surface';
import { type BrushElementModel, DefaultTheme } from '@blocksuite/affine-model';

export const brush: ElementRenderer<BrushElementModel> = (
  model,
  ctx,
  matrix,
  renderer
) => {
  const { rotate } = model;
  const [, , w, h] = model.deserializedXYWH;
  const cx = w / 2;
  const cy = h / 2;

  ctx.setTransform(
    matrix.translateSelf(cx, cy).rotateSelf(rotate).translateSelf(-cx, -cy)
  );

  const color = renderer.getColorValue(model.color, DefaultTheme.black, true);

  ctx.fillStyle = color;

  ctx.fill(new Path2D(model.commands));
};

export const BrushElementRendererExtension = ElementRendererExtension(
  'brush',
  brush
);
