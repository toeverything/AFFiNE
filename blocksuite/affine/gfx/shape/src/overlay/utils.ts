import type { Options } from '@blocksuite/affine-block-surface';
import { shapeMethods } from '@blocksuite/affine-model';
import { Bound, type XYWH } from '@blocksuite/global/gfx';

export const drawGeneralShape = (
  ctx: CanvasRenderingContext2D,
  type: string,
  xywh: XYWH,
  options: Options
) => {
  ctx.setLineDash(options.strokeLineDash ?? []);
  ctx.strokeStyle = options.stroke ?? 'transparent';
  ctx.lineWidth = options.strokeWidth ?? 2;
  ctx.fillStyle = options.fill ?? 'transparent';

  ctx.beginPath();

  const bound = Bound.fromXYWH(xywh);
  switch (type) {
    case 'rect':
      shapeMethods.rect.draw(ctx, bound);
      break;
    case 'triangle':
      shapeMethods.triangle.draw(ctx, bound);
      break;
    case 'diamond':
      shapeMethods.diamond.draw(ctx, bound);
      break;
    case 'ellipse':
      shapeMethods.ellipse.draw(ctx, bound);
      break;
    case 'triangleRight':
      shapeMethods.triangleRight.draw(ctx, bound);
      break;
    case 'hexagon':
      shapeMethods.hexagon.draw(ctx, bound);
      break;
    case 'parallelogram':
      shapeMethods.parallelogram.draw(ctx, bound);
      break;
    case 'trapezoid':
      shapeMethods.trapezoid.draw(ctx, bound);
      break;
    case 'step':
      shapeMethods.step.draw(ctx, bound);
      break;
    case 'cylinder':
      shapeMethods.cylinder.draw(ctx, bound);
      break;
    case 'cloud':
      shapeMethods.cloud.draw(ctx, bound);
      break;
    case 'document':
      shapeMethods.document.draw(ctx, bound);
      break;
    case 'note':
      shapeMethods.note.draw(ctx, bound);
      break;
    case 'cube':
      shapeMethods.cube.draw(ctx, bound);
      break;
    case 'callout':
      shapeMethods.callout.draw(ctx, bound);
      break;
    case 'actor':
      shapeMethods.actor.draw(ctx, bound);
      break;
    case 'dataStorage':
      shapeMethods.dataStorage.draw(ctx, bound);
      break;
    case 'tape':
      shapeMethods.tape.draw(ctx, bound);
      break;
    case 'internalStorage':
      shapeMethods.internalStorage.draw(ctx, bound);
      break;
    case 'logicAnd':
      shapeMethods.logicAnd.draw(ctx, bound);
      break;
    case 'logicOr':
      shapeMethods.logicOr.draw(ctx, bound);
      break;
    case 'roundedRect':
      drawRoundedRect(ctx, xywh);
      break;
    default:
      throw new Error(`Unknown shape type: ${type}`);
  }

  ctx.closePath();

  ctx.fill();
  ctx.stroke();
};

function drawRoundedRect(ctx: CanvasRenderingContext2D, xywh: XYWH): void {
  const [x, y, w, h] = xywh;
  const width = w;
  const height = h;
  const radius = 0.1;
  const cornerRadius = Math.min(width * radius, height * radius);
  ctx.moveTo(x + cornerRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, cornerRadius);
  ctx.arcTo(x + width, y + height, x, y + height, cornerRadius);
  ctx.arcTo(x, y + height, x, y, cornerRadius);
  ctx.arcTo(x, y, x + width, y, cornerRadius);
}
