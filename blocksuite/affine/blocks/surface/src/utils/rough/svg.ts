import type {
  Config,
  Drawable,
  OpSet,
  Options,
  ResolvedOptions,
} from './core.js';
import { SVGNS } from './core.js';
import { RoughGenerator } from './generator.js';
import type { Point } from './geometry.js';

export class RoughSVG {
  private readonly gen: RoughGenerator;

  private readonly svg: SVGSVGElement;

  get generator(): RoughGenerator {
    return this.gen;
  }

  constructor(svg: SVGSVGElement, config?: Config) {
    this.svg = svg;
    this.gen = new RoughGenerator(config);
  }

  private fillSketch(
    doc: Document,
    drawing: OpSet,
    o: ResolvedOptions
  ): SVGPathElement {
    let fweight = o.fillWeight;
    if (fweight < 0) {
      fweight = o.strokeWidth / 2;
    }
    const path = doc.createElementNS(SVGNS, 'path');
    path.setAttribute('d', this.opsToPath(drawing, o.fixedDecimalPlaceDigits));
    path.setAttribute('stroke', o.fill || '');
    path.setAttribute('stroke-width', fweight + '');
    path.setAttribute('fill', 'none');
    if (o.fillLineDash) {
      path.setAttribute('stroke-dasharray', o.fillLineDash.join(' ').trim());
    }
    if (o.fillLineDashOffset) {
      path.setAttribute('stroke-dashoffset', `${o.fillLineDashOffset}`);
    }
    return path;
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
  ): SVGGElement {
    const d = this.gen.arc(x, y, width, height, start, stop, closed, options);
    return this.draw(d);
  }

  circle(
    x: number,
    y: number,
    diameter: number,
    options?: Options
  ): SVGGElement {
    const d = this.gen.circle(x, y, diameter, options);
    return this.draw(d);
  }

  curve(points: Point[], options?: Options): SVGGElement {
    const d = this.gen.curve(points, options);
    return this.draw(d);
  }

  draw(drawable: Drawable): SVGGElement {
    const sets = drawable.sets || [];
    const o = drawable.options || this.getDefaultOptions();
    const doc = this.svg.ownerDocument || window.document;
    const g = doc.createElementNS(SVGNS, 'g');
    const precision = drawable.options.fixedDecimalPlaceDigits;
    for (const drawing of sets) {
      let path = null;
      switch (drawing.type) {
        case 'path': {
          path = doc.createElementNS(SVGNS, 'path');
          path.setAttribute('d', this.opsToPath(drawing, precision));
          path.setAttribute('stroke', o.stroke);
          path.setAttribute('stroke-width', o.strokeWidth + '');
          path.setAttribute('fill', 'none');
          if (o.strokeLineDash) {
            path.setAttribute(
              'stroke-dasharray',
              o.strokeLineDash.join(' ').trim()
            );
          }
          if (o.strokeLineDashOffset) {
            path.setAttribute('stroke-dashoffset', `${o.strokeLineDashOffset}`);
          }
          break;
        }
        case 'fillPath': {
          path = doc.createElementNS(SVGNS, 'path');
          path.setAttribute('d', this.opsToPath(drawing, precision));
          path.setAttribute('stroke', 'none');
          path.setAttribute('stroke-width', '0');
          path.setAttribute('fill', o.fill || '');
          if (drawable.shape === 'curve' || drawable.shape === 'polygon') {
            path.setAttribute('fill-rule', 'evenodd');
          }
          break;
        }
        case 'fillSketch': {
          path = this.fillSketch(doc, drawing, o);
          break;
        }
      }
      if (path) {
        g.append(path);
      }
    }
    return g;
  }

  ellipse(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: Options
  ): SVGGElement {
    const d = this.gen.ellipse(x, y, width, height, options);
    return this.draw(d);
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
  ): SVGGElement {
    const d = this.gen.line(x1, y1, x2, y2, options);
    return this.draw(d);
  }

  linearPath(points: Point[], options?: Options): SVGGElement {
    const d = this.gen.linearPath(points, options);
    return this.draw(d);
  }

  opsToPath(drawing: OpSet, fixedDecimalPlaceDigits?: number): string {
    return this.gen.opsToPath(drawing, fixedDecimalPlaceDigits);
  }

  path(d: string, options?: Options): SVGGElement {
    const drawing = this.gen.path(d, options);
    return this.draw(drawing);
  }

  polygon(points: Point[], options?: Options): SVGGElement {
    const d = this.gen.polygon(points, options);
    return this.draw(d);
  }

  rectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: Options
  ): SVGGElement {
    const d = this.gen.rectangle(x, y, width, height, options);
    return this.draw(d);
  }
}
