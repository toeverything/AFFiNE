import {
  DEFAULT_ROUGHNESS,
  LineWidth,
  StrokeStyle,
} from '@blocksuite/affine-model';

export const SHAPE_OVERLAY_WIDTH = 100;
export const SHAPE_OVERLAY_HEIGHT = 100;
export const SHAPE_OVERLAY_OFFSET_X = 6;
export const SHAPE_OVERLAY_OFFSET_Y = 6;
export const SHAPE_OVERLAY_OPTIONS = {
  seed: 666,
  roughness: DEFAULT_ROUGHNESS,
  strokeStyle: StrokeStyle.Solid,
  strokeLineDash: [] as number[],
  stroke: 'black',
  strokeWidth: LineWidth.Two,
  fill: 'transparent',
};
