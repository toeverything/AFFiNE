import {
  getSurfaceComponent,
  type Options,
  type RoughCanvas,
  ToolOverlay,
} from '@blocksuite/affine-block-surface';
import {
  type Color,
  DefaultTheme,
  type ShapeStyle,
} from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import type { XYWH } from '@blocksuite/global/gfx';
import { assertType } from '@blocksuite/global/utils';
import type { GfxController } from '@blocksuite/std/gfx';
import { effect } from '@preact/signals-core';

import {
  SHAPE_OVERLAY_HEIGHT,
  SHAPE_OVERLAY_OFFSET_X,
  SHAPE_OVERLAY_OFFSET_Y,
  SHAPE_OVERLAY_WIDTH,
} from '../consts';
import type { ShapeTool } from '../shape-tool';
import { ShapeFactory } from './factory';
import type { Shape } from './shape';

export class ShapeOverlay extends ToolOverlay {
  shape: Shape;

  constructor(
    gfx: GfxController,
    type: string,
    options: Options,
    style: {
      shapeStyle: ShapeStyle;
      fillColor: Color;
      strokeColor: Color;
    }
  ) {
    super(gfx);
    const xywh = [
      this.x,
      this.y,
      SHAPE_OVERLAY_WIDTH,
      SHAPE_OVERLAY_HEIGHT,
    ] as XYWH;
    const { shapeStyle, fillColor, strokeColor } = style;
    const fill = this.gfx.std
      .get(ThemeProvider)
      .getColorValue(fillColor, DefaultTheme.shapeFillColor, true);
    const stroke = this.gfx.std
      .get(ThemeProvider)
      .getColorValue(strokeColor, DefaultTheme.shapeStrokeColor, true);

    options.fill = fill;
    options.stroke = stroke;

    this.shape = ShapeFactory.createShape(xywh, type, options, shapeStyle);
    this.disposables.add(
      effect(() => {
        const currentTool = this.gfx.tool.currentTool$.value;

        if (currentTool?.toolName !== 'shape') return;

        assertType<ShapeTool>(currentTool);

        const { shapeName } = currentTool.activatedOption;
        const newOptions = {
          ...options,
        };

        let { x, y } = this;
        if (shapeName === 'roundedRect' || shapeName === 'rect') {
          x += SHAPE_OVERLAY_OFFSET_X;
          y += SHAPE_OVERLAY_OFFSET_Y;
        }
        const w =
          shapeName === 'roundedRect'
            ? SHAPE_OVERLAY_WIDTH + 40
            : SHAPE_OVERLAY_WIDTH;
        const xywh = [x, y, w, SHAPE_OVERLAY_HEIGHT] as XYWH;
        this.shape = ShapeFactory.createShape(
          xywh,
          shapeName,
          newOptions,
          shapeStyle
        );

        const surface = getSurfaceComponent(this.gfx.std);
        surface?.refresh();
      })
    );
  }

  override render(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    ctx.globalAlpha = this.globalAlpha;
    let { x, y } = this;
    const { type } = this.shape;
    if (type === 'roundedRect' || type === 'rect') {
      x += SHAPE_OVERLAY_OFFSET_X;
      y += SHAPE_OVERLAY_OFFSET_Y;
    }
    const w =
      type === 'roundedRect' ? SHAPE_OVERLAY_WIDTH + 40 : SHAPE_OVERLAY_WIDTH;
    const xywh = [x, y, w, SHAPE_OVERLAY_HEIGHT] as XYWH;
    this.shape.xywh = xywh;
    this.shape.draw(ctx, rc);
  }
}
