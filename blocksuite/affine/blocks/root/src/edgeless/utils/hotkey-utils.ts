import type { ShapeToolOption } from '@blocksuite/affine-gfx-shape';
import { ShapeType } from '@blocksuite/affine-model';

const shapeMap: Record<ShapeToolOption['shapeName'], number> = {
  [ShapeType.Rect]: 0,
  [ShapeType.Ellipse]: 1,
  [ShapeType.Diamond]: 2,
  [ShapeType.Triangle]: 3,
  roundedRect: 4,
};
const shapes = Object.keys(shapeMap) as ShapeToolOption['shapeName'][];

export function getNextShapeType(cur: ShapeToolOption['shapeName']) {
  return shapes[(shapeMap[cur] + 1) % shapes.length];
}
