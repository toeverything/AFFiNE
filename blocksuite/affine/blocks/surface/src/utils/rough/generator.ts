import { curveToBezier } from '../points-on-curve/curve-to-bezier.js';
import { pointsOnBezierCurves } from '../points-on-curve/index.js';
import { pointsOnPath } from '../points-on-path/index.js';
import type {
  Config,
  Drawable,
  OpSet,
  Options,
  PathInfo,
  ResolvedOptions,
} from './core.js';
import type { Point } from './geometry.js';
import { randomSeed } from './math.js';
import {
  arc,
  curve,
  ellipseWithParams,
  generateEllipseParams,
  line,
  linearPath,
  patternFillArc,
  patternFillPolygons,
  rectangle,
  solidFillPolygon,
  svgPath,
} from './renderer.js';

const NOS = 'none';

export class RoughGenerator {
  private readonly config: Config;

  defaultOptions: ResolvedOptions = {
    maxRandomnessOffset: 2,
    roughness: 1,
    bowing: 1,
    stroke: '#000',
    strokeWidth: 1,
    curveTightness: 0,
    curveFitting: 0.95,
    curveStepCount: 9,
    fillStyle: 'hachure',
    fillWeight: -1,
    hachureAngle: -41,
    hachureGap: -1,
    dashOffset: -1,
    dashGap: -1,
    zigzagOffset: -1,
    seed: 0,
    disableMultiStroke: false,
    disableMultiStrokeFill: false,
    preserveVertices: false,
  };

  constructor(config?: Config) {
    this.config = config || {};
    if (this.config.options) {
      this.defaultOptions = this._o(this.config.options);
    }
  }

  static newSeed(): number {
    return randomSeed();
  }

  private _d(shape: string, sets: OpSet[], options: ResolvedOptions): Drawable {
    return { shape, sets: sets || [], options: options || this.defaultOptions };
  }

  private _o(options?: Options): ResolvedOptions {
    return options
      ? Object.assign({}, this.defaultOptions, options)
      : this.defaultOptions;
  }

  private fillSketch(drawing: OpSet, o: ResolvedOptions): PathInfo {
    let fweight = o.fillWeight;
    if (fweight < 0) {
      fweight = o.strokeWidth / 2;
    }
    return {
      d: this.opsToPath(drawing),
      stroke: o.fill || NOS,
      strokeWidth: fweight,
      fill: NOS,
    };
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
    const o = this._o(options);
    const paths = [];
    const outline = arc(x, y, width, height, start, stop, closed, true, o);
    if (closed && o.fill) {
      if (o.fillStyle === 'solid') {
        const fillOptions: ResolvedOptions = { ...o };
        fillOptions.disableMultiStroke = true;
        const shape = arc(
          x,
          y,
          width,
          height,
          start,
          stop,
          true,
          false,
          fillOptions
        );
        shape.type = 'fillPath';
        paths.push(shape);
      } else {
        paths.push(patternFillArc(x, y, width, height, start, stop, o));
      }
    }
    if (o.stroke !== NOS) {
      paths.push(outline);
    }
    return this._d('arc', paths, o);
  }

  circle(x: number, y: number, diameter: number, options?: Options): Drawable {
    const ret = this.ellipse(x, y, diameter, diameter, options);
    ret.shape = 'circle';
    return ret;
  }

  curve(points: Point[], options?: Options): Drawable {
    const o = this._o(options);
    const paths: OpSet[] = [];
    const outline = curve(points, o);
    if (o.fill && o.fill !== NOS && points.length >= 3) {
      const bcurve = curveToBezier(points);
      const polyPoints = pointsOnBezierCurves(
        bcurve,
        10,
        (1 + o.roughness) / 2
      );
      if (o.fillStyle === 'solid') {
        paths.push(solidFillPolygon([polyPoints], o));
      } else {
        paths.push(patternFillPolygons([polyPoints], o));
      }
    }
    if (o.stroke !== NOS) {
      paths.push(outline);
    }
    return this._d('curve', paths, o);
  }

  ellipse(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: Options
  ): Drawable {
    const o = this._o(options);
    const paths: OpSet[] = [];
    const ellipseParams = generateEllipseParams(width, height, o);
    const ellipseResponse = ellipseWithParams(x, y, o, ellipseParams);
    if (o.fill) {
      if (o.fillStyle === 'solid') {
        const shape = ellipseWithParams(x, y, o, ellipseParams).opset;
        shape.type = 'fillPath';
        paths.push(shape);
      } else {
        paths.push(patternFillPolygons([ellipseResponse.estimatedPoints], o));
      }
    }
    if (o.stroke !== NOS) {
      paths.push(ellipseResponse.opset);
    }
    return this._d('ellipse', paths, o);
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options?: Options
  ): Drawable {
    const o = this._o(options);
    return this._d('line', [line(x1, y1, x2, y2, o)], o);
  }

  linearPath(points: Point[], options?: Options): Drawable {
    const o = this._o(options);
    return this._d('linearPath', [linearPath(points, false, o)], o);
  }

  opsToPath(drawing: OpSet, fixedDecimals?: number): string {
    let path = '';
    for (const item of drawing.ops) {
      const data =
        typeof fixedDecimals === 'number' && fixedDecimals >= 0
          ? item.data.map(d => +d.toFixed(fixedDecimals))
          : item.data;
      switch (item.op) {
        case 'move':
          path += `M${data[0]} ${data[1]} `;
          break;
        case 'bcurveTo':
          path += `C${data[0]} ${data[1]}, ${data[2]} ${data[3]}, ${data[4]} ${data[5]} `;
          break;
        case 'lineTo':
          path += `L${data[0]} ${data[1]} `;
          break;
      }
    }
    return path.trim();
  }

  path(d: string, options?: Options): Drawable {
    const o = this._o(options);
    const paths: OpSet[] = [];
    if (!d) {
      return this._d('path', paths, o);
    }
    d = (d || '')
      .replace(/\n/g, ' ')
      .replace(/(-\s)/g, '-')
      .replace('/(ss)/g', ' ');

    const hasFill = o.fill && o.fill !== 'transparent' && o.fill !== NOS;
    const hasStroke = o.stroke !== NOS;
    const simplified = !!(o.simplification && o.simplification < 1);
    const distance = simplified
      ? 4 - 4 * o.simplification!
      : (1 + o.roughness) / 2;
    const sets = pointsOnPath(d, 1, distance);

    if (hasFill) {
      if (o.fillStyle === 'solid') {
        paths.push(solidFillPolygon(sets, o));
      } else {
        paths.push(patternFillPolygons(sets, o));
      }
    }
    if (hasStroke) {
      if (simplified) {
        sets.forEach(set => {
          paths.push(linearPath(set, false, o));
        });
      } else {
        paths.push(svgPath(d, o));
      }
    }

    return this._d('path', paths, o);
  }

  polygon(points: Point[], options?: Options): Drawable {
    const o = this._o(options);
    const paths: OpSet[] = [];
    const outline = linearPath(points, true, o);
    if (o.fill) {
      if (o.fillStyle === 'solid') {
        paths.push(solidFillPolygon([points], o));
      } else {
        paths.push(patternFillPolygons([points], o));
      }
    }
    if (o.stroke !== NOS) {
      paths.push(outline);
    }
    return this._d('polygon', paths, o);
  }

  rectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: Options
  ): Drawable {
    const o = this._o(options);
    const paths = [];
    const outline = rectangle(x, y, width, height, o);
    if (o.fill) {
      const points: Point[] = [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ];
      if (o.fillStyle === 'solid') {
        paths.push(solidFillPolygon([points], o));
      } else {
        paths.push(patternFillPolygons([points], o));
      }
    }
    if (o.stroke !== NOS) {
      paths.push(outline);
    }
    return this._d('rectangle', paths, o);
  }

  toPaths(drawable: Drawable): PathInfo[] {
    const sets = drawable.sets || [];
    const o = drawable.options || this.defaultOptions;
    const paths: PathInfo[] = [];
    for (const drawing of sets) {
      let path: PathInfo | null = null;
      switch (drawing.type) {
        case 'path':
          path = {
            d: this.opsToPath(drawing),
            stroke: o.stroke,
            strokeWidth: o.strokeWidth,
            fill: NOS,
          };
          break;
        case 'fillPath':
          path = {
            d: this.opsToPath(drawing),
            stroke: NOS,
            strokeWidth: 0,
            fill: o.fill || NOS,
          };
          break;
        case 'fillSketch':
          path = this.fillSketch(drawing, o);
          break;
      }
      if (path) {
        paths.push(path);
      }
    }
    return paths;
  }
}
