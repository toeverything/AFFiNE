import type {
  Config,
  Drawable,
  OpSet,
  Options,
  ResolvedOptions,
} from './core.js';
import { RoughGenerator } from './generator.js';
import type { Point } from './geometry.js';

export class RoughCanvas {
  private readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;

  private readonly gen: RoughGenerator;

  get generator(): RoughGenerator {
    return this.gen;
  }

  constructor(canvas: HTMLCanvasElement, config?: Config) {
    this.canvas = canvas;

    this.ctx = this.canvas.getContext('2d')!;
    this.gen = new RoughGenerator(config);
  }

  private _drawToContext(
    ctx: CanvasRenderingContext2D,
    drawing: OpSet,
    fixedDecimals?: number,
    rule: CanvasFillRule = 'nonzero'
  ) {
    ctx.beginPath();
    for (const item of drawing.ops) {
      const data =
        typeof fixedDecimals === 'number' && fixedDecimals >= 0
          ? item.data.map(d => +d.toFixed(fixedDecimals))
          : item.data;
      switch (item.op) {
        case 'move':
          ctx.moveTo(data[0], data[1]);
          break;
        case 'bcurveTo':
          ctx.bezierCurveTo(
            data[0],
            data[1],
            data[2],
            data[3],
            data[4],
            data[5]
          );
          break;
        case 'lineTo':
          ctx.lineTo(data[0], data[1]);
          break;
      }
    }
    if (drawing.type === 'fillPath') {
      ctx.fill(rule);
    } else {
      ctx.stroke();
    }
  }

  private fillSketch(
    ctx: CanvasRenderingContext2D,
    drawing: OpSet,
    o: ResolvedOptions
  ) {
    let fweight = o.fillWeight;
    if (fweight < 0) {
      fweight = o.strokeWidth / 2;
    }
    ctx.save();
    if (o.fillLineDash) {
      ctx.setLineDash(o.fillLineDash);
    }
    if (o.fillLineDashOffset) {
      ctx.lineDashOffset = o.fillLineDashOffset;
    }
    ctx.strokeStyle = o.fill || '';
    ctx.lineWidth = fweight;
    this._drawToContext(ctx, drawing, o.fixedDecimalPlaceDigits);
    ctx.restore();
  }

  arc(
    x: number,
    y: number,
    width: number,
    height: number,
    start: number,
    stop: number,
    closed = false,
    options?: Options
  ): Drawable {
    const d = this.gen.arc(x, y, width, height, start, stop, closed, options);
    this.draw(d);
    return d;
  }

  circle(x: number, y: number, diameter: number, options?: Options): Drawable {
    const d = this.gen.circle(x, y, diameter, options);
    this.draw(d);
    return d;
  }

  curve(points: Point[], options?: Options): Drawable {
    const d = this.gen.curve(points, options);
    this.draw(d);
    return d;
  }

  draw(drawable: Drawable): void {
    const sets = drawable.sets || [];
    const o = drawable.options || this.getDefaultOptions();
    const ctx = this.ctx;
    const precision = drawable.options.fixedDecimalPlaceDigits;

    for (const drawing of sets) {
      switch (drawing.type) {
        case 'path':
          ctx.save();
          ctx.strokeStyle = o.stroke === 'none' ? 'transparent' : o.stroke;
          ctx.lineWidth = o.strokeWidth;
          if (o.strokeLineDash) {
            ctx.setLineDash(o.strokeLineDash);
          }
          if (o.strokeLineDashOffset) {
            ctx.lineDashOffset = o.strokeLineDashOffset;
          }
          this._drawToContext(ctx, drawing, precision);
          ctx.restore();
          break;
        case 'fillPath': {
          ctx.save();
          ctx.fillStyle = o.fill || '';
          const fillRule: CanvasFillRule =
            drawable.shape === 'curve' ||
            drawable.shape === 'polygon' ||
            drawable.shape === 'path'
              ? 'evenodd'
              : 'nonzero';
          this._drawToContext(ctx, drawing, precision, fillRule);
          ctx.restore();
          break;
        }
        case 'fillSketch':
          this.fillSketch(ctx, drawing, o);
          break;
      }
    }
  }

  ellipse(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: Options
  ): Drawable {
    const d = this.gen.ellipse(x, y, width, height, options);
    this.draw(d);
    return d;
  }

  getDefaultOptions(): ResolvedOptions {
    return this.gen.defaultOptions;
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options?: Options
  ): Drawable {
    const d = this.gen.line(x1, y1, x2, y2, options);
    this.draw(d);
    return d;
  }

  linearPath(points: Point[], options?: Options): Drawable {
    const d = this.gen.linearPath(points, options);
    this.draw(d);
    return d;
  }

  path(d: string, options?: Options): Drawable {
    const drawing = this.gen.path(d, options);
    this.draw(drawing);
    return drawing;
  }

  polygon(points: Point[], options?: Options): Drawable {
    const d = this.gen.polygon(points, options);
    this.draw(d);
    return d;
  }

  rectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: Options
  ): Drawable {
    const d = this.gen.rectangle(x, y, width, height, options);
    this.draw(d);
    return d;
  }
}
