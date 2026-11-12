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

const getOverlaySize = (shapeName: string) => {
  switch (shapeName) {
    case 'roundedRect':
    case 'rect':
      return {
        width: SHAPE_OVERLAY_WIDTH + 40,
        height: SHAPE_OVERLAY_HEIGHT,
        offsetX: SHAPE_OVERLAY_OFFSET_X,
        offsetY: SHAPE_OVERLAY_OFFSET_Y,
      };
    case 'container':
    case 'verticalContainer':
    case 'horizontalContainer':
      return { width: 400, height: 400, offsetX: 0, offsetY: 0 };
    case 'mindmapBranch':
      return { width: 200, height: 32, offsetX: 0, offsetY: 0 };
    case 'mindmapCentralIdea':
    case 'mindmapSubTopic':
    case 'mindmapSquare':
      return { width: 200, height: 80, offsetX: 0, offsetY: 0 };
    default:
      return {
        width: SHAPE_OVERLAY_WIDTH,
        height: SHAPE_OVERLAY_HEIGHT,
        offsetX: 0,
        offsetY: 0,
      };
  }
};

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
    },
    stencilName?: string
  ) {
    super(gfx);
    const { shapeStyle, fillColor, strokeColor } = style;
    const fill = this.gfx.std
      .get(ThemeProvider)
      .getColorValue(fillColor, DefaultTheme.shapeFillColor, true);
    const stroke = this.gfx.std
      .get(ThemeProvider)
      .getColorValue(strokeColor, DefaultTheme.shapeStrokeColor, true);

    options.fill = fill;
    options.stroke = stroke;

    const initialSize = getOverlaySize(type);
    const initialXYWH = [
      this.x + initialSize.offsetX,
      this.y + initialSize.offsetY,
      initialSize.width,
      initialSize.height,
    ] as XYWH;
    const initialOptions = {
      ...options,
      fill: type === 'mindmapBranch' ? 'transparent' : options.fill,
    };

    this.shape = ShapeFactory.createShape(
      initialXYWH,
      type,
      initialOptions,
      shapeStyle,
      stencilName
    );
    this.disposables.add(
      effect(() => {
        const currentTool = this.gfx.tool.currentTool$.value;

        if (currentTool?.toolName !== 'shape') return;

        assertType<ShapeTool>(currentTool);

        const { shapeName, stencilName: nextStencilName } =
          currentTool.activatedOption;
        const newOptions = {
          ...options,
          fill: shapeName === 'mindmapBranch' ? 'transparent' : options.fill,
        };

        const size = getOverlaySize(shapeName);
        const xywh = [
          this.x + size.offsetX,
          this.y + size.offsetY,
          size.width,
          size.height,
        ] as XYWH;
        this.shape = ShapeFactory.createShape(
          xywh,
          shapeName,
          newOptions,
          shapeStyle,
          nextStencilName
        );

        const surface = getSurfaceComponent(this.gfx.std);
        surface?.refresh();
      })
    );
  }

  override render(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    ctx.globalAlpha = this.globalAlpha;
    const { type } = this.shape;
    const size = getOverlaySize(type);
    const xywh = [
      this.x + size.offsetX,
      this.y + size.offsetY,
      size.width,
      size.height,
    ] as XYWH;
    this.shape.xywh = xywh;
    this.shape.draw(ctx, rc);
  }
}
