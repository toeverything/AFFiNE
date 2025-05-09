import { absolutize } from '../path-data-parser/absolutize.js';
import { normalize } from '../path-data-parser/normalize.js';
import { parsePath } from '../path-data-parser/parser.js';
import type { Op, OpSet, ResolvedOptions } from './core.js';
import { getFiller } from './fillers/filler.js';
import type { RenderHelper } from './fillers/filler-interface.js';
import type { Point } from './geometry.js';
import { Random } from './math.js';

interface EllipseParams {
  rx: number;
  ry: number;
  increment: number;
}

const helper: RenderHelper = {
  randOffset,
  randOffsetWithRange,
  ellipse,
  doubleLineOps: doubleLineFillOps,
};

export function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  o: ResolvedOptions
): OpSet {
  return { type: 'path', ops: _doubleLine(x1, y1, x2, y2, o) };
}

export function linearPath(
  points: Point[],
  close: boolean,
  o: ResolvedOptions
): OpSet {
  const len = (points || []).length;
  if (len > 2) {
    const ops: Op[] = [];
    for (let i = 0; i < len - 1; i++) {
      ops.push(
        ..._doubleLine(
          points[i][0],
          points[i][1],
          points[i + 1][0],
          points[i + 1][1],
          o
        )
      );
    }
    if (close) {
      ops.push(
        ..._doubleLine(
          points[len - 1][0],
          points[len - 1][1],
          points[0][0],
          points[0][1],
          o
        )
      );
    }
    return { type: 'path', ops };
  } else if (len === 2) {
    return line(points[0][0], points[0][1], points[1][0], points[1][1], o);
  }
  return { type: 'path', ops: [] };
}

export function polygon(points: Point[], o: ResolvedOptions): OpSet {
  return linearPath(points, true, o);
}

export function rectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  o: ResolvedOptions
): OpSet {
  const points: Point[] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  return polygon(points, o);
}

export function curve(points: Point[], o: ResolvedOptions): OpSet {
  let o1 = _curveWithOffset(points, 1 * (1 + o.roughness * 0.2), o);
  if (!o.disableMultiStroke) {
    const o2 = _curveWithOffset(
      points,
      1.5 * (1 + o.roughness * 0.22),
      cloneOptionsAlterSeed(o)
    );
    o1 = o1.concat(o2);
  }
  return { type: 'path', ops: o1 };
}

export interface EllipseResult {
  opset: OpSet;
  estimatedPoints: Point[];
}

export function ellipse(
  x: number,
  y: number,
  width: number,
  height: number,
  o: ResolvedOptions
): OpSet {
  const params = generateEllipseParams(width, height, o);
  return ellipseWithParams(x, y, o, params).opset;
}

export function generateEllipseParams(
  width: number,
  height: number,
  o: ResolvedOptions
): EllipseParams {
  const psq = Math.sqrt(
    Math.PI *
      2 *
      Math.sqrt((Math.pow(width / 2, 2) + Math.pow(height / 2, 2)) / 2)
  );
  const stepCount = Math.ceil(
    Math.max(o.curveStepCount, (o.curveStepCount / Math.sqrt(200)) * psq)
  );
  const increment = (Math.PI * 2) / stepCount;
  let rx = Math.abs(width / 2);
  let ry = Math.abs(height / 2);
  const curveFitRandomness = 1 - o.curveFitting;
  rx += _offsetOpt(rx * curveFitRandomness, o);
  ry += _offsetOpt(ry * curveFitRandomness, o);
  return { increment, rx, ry };
}

export function ellipseWithParams(
  x: number,
  y: number,
  o: ResolvedOptions,
  ellipseParams: EllipseParams
): EllipseResult {
  const [ap1, cp1] = _computeEllipsePoints(
    ellipseParams.increment,
    x,
    y,
    ellipseParams.rx,
    ellipseParams.ry,
    1,
    ellipseParams.increment * _offset(0.1, _offset(0.4, 1, o), o),
    o
  );
  let o1 = _curve(ap1, null, o);
  if (!o.disableMultiStroke && o.roughness !== 0) {
    const [ap2] = _computeEllipsePoints(
      ellipseParams.increment,
      x,
      y,
      ellipseParams.rx,
      ellipseParams.ry,
      1.5,
      0,
      o
    );
    const o2 = _curve(ap2, null, o);
    o1 = o1.concat(o2);
  }
  return {
    estimatedPoints: cp1,
    opset: { type: 'path', ops: o1 },
  };
}

export function arc(
  x: number,
  y: number,
  width: number,
  height: number,
  start: number,
  stop: number,
  closed: boolean,
  roughClosure: boolean,
  o: ResolvedOptions
): OpSet {
  const cx = x;
  const cy = y;
  let rx = Math.abs(width / 2);
  let ry = Math.abs(height / 2);
  rx += _offsetOpt(rx * 0.01, o);
  ry += _offsetOpt(ry * 0.01, o);
  let strt = start;
  let stp = stop;
  while (strt < 0) {
    strt += Math.PI * 2;
    stp += Math.PI * 2;
  }
  if (stp - strt > Math.PI * 2) {
    strt = 0;
    stp = Math.PI * 2;
  }
  const ellipseInc = (Math.PI * 2) / o.curveStepCount;
  const arcInc = Math.min(ellipseInc / 2, (stp - strt) / 2);
  const ops = _arc(arcInc, cx, cy, rx, ry, strt, stp, 1, o);
  if (!o.disableMultiStroke) {
    const o2 = _arc(arcInc, cx, cy, rx, ry, strt, stp, 1.5, o);
    ops.push(...o2);
  }
  if (closed) {
    if (roughClosure) {
      ops.push(
        ..._doubleLine(
          cx,
          cy,
          cx + rx * Math.cos(strt),
          cy + ry * Math.sin(strt),
          o
        ),
        ..._doubleLine(
          cx,
          cy,
          cx + rx * Math.cos(stp),
          cy + ry * Math.sin(stp),
          o
        )
      );
    } else {
      ops.push(
        { op: 'lineTo', data: [cx, cy] },
        {
          op: 'lineTo',
          data: [cx + rx * Math.cos(strt), cy + ry * Math.sin(strt)],
        }
      );
    }
  }
  return { type: 'path', ops };
}

export function svgPath(path: string, o: ResolvedOptions): OpSet {
  const segments = normalize(absolutize(parsePath(path)));
  const ops: Op[] = [];
  let first: Point = [0, 0];
  let current: Point = [0, 0];
  for (const { key, data } of segments) {
    switch (key) {
      case 'M': {
        const ro = 1 * (o.maxRandomnessOffset || 0);
        const pv = o.preserveVertices;
        ops.push({
          op: 'move',
          data: data.map(d => d + (pv ? 0 : _offsetOpt(ro, o))),
        });
        current = [data[0], data[1]];
        first = [data[0], data[1]];
        break;
      }
      case 'L':
        ops.push(..._doubleLine(current[0], current[1], data[0], data[1], o));
        current = [data[0], data[1]];
        break;
      case 'C': {
        const [x1, y1, x2, y2, x, y] = data;
        ops.push(..._bezierTo(x1, y1, x2, y2, x, y, current, o));
        current = [x, y];
        break;
      }
      case 'Z':
        ops.push(..._doubleLine(current[0], current[1], first[0], first[1], o));
        current = [first[0], first[1]];
        break;
    }
  }
  return { type: 'path', ops };
}

// Fills

export function solidFillPolygon(
  polygonList: Point[][],
  o: ResolvedOptions
): OpSet {
  const ops: Op[] = [];
  for (const points of polygonList) {
    if (points.length) {
      const offset = o.maxRandomnessOffset || 0;
      const len = points.length;
      if (len > 2) {
        ops.push({
          op: 'move',
          data: [
            points[0][0] + _offsetOpt(offset, o),
            points[0][1] + _offsetOpt(offset, o),
          ],
        });
        for (let i = 1; i < len; i++) {
          ops.push({
            op: 'lineTo',
            data: [
              points[i][0] + _offsetOpt(offset, o),
              points[i][1] + _offsetOpt(offset, o),
            ],
          });
        }
      }
    }
  }
  return { type: 'fillPath', ops };
}

export function patternFillPolygons(
  polygonList: Point[][],
  o: ResolvedOptions
): OpSet {
  return getFiller(o, helper).fillPolygons(polygonList, o);
}

export function patternFillArc(
  x: number,
  y: number,
  width: number,
  height: number,
  start: number,
  stop: number,
  o: ResolvedOptions
): OpSet {
  const cx = x;
  const cy = y;
  let rx = Math.abs(width / 2);
  let ry = Math.abs(height / 2);
  rx += _offsetOpt(rx * 0.01, o);
  ry += _offsetOpt(ry * 0.01, o);
  let strt = start;
  let stp = stop;
  while (strt < 0) {
    strt += Math.PI * 2;
    stp += Math.PI * 2;
  }
  if (stp - strt > Math.PI * 2) {
    strt = 0;
    stp = Math.PI * 2;
  }
  const increment = (stp - strt) / o.curveStepCount;
  const points: Point[] = [];
  for (let angle = strt; angle <= stp; angle = angle + increment) {
    points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  points.push([cx + rx * Math.cos(stp), cy + ry * Math.sin(stp)]);
  points.push([cx, cy]);
  return patternFillPolygons([points], o);
}

export function randOffset(x: number, o: ResolvedOptions): number {
  return _offsetOpt(x, o);
}

export function randOffsetWithRange(
  min: number,
  max: number,
  o: ResolvedOptions
): number {
  return _offset(min, max, o);
}

export function doubleLineFillOps(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  o: ResolvedOptions
): Op[] {
  return _doubleLine(x1, y1, x2, y2, o, true);
}

// Private helpers

function cloneOptionsAlterSeed(ops: ResolvedOptions): ResolvedOptions {
  const result: ResolvedOptions = { ...ops };
  result.randomizer = undefined;
  if (ops.seed) {
    result.seed = ops.seed + 1;
  }
  return result;
}

function random(ops: ResolvedOptions): number {
  if (!ops.randomizer) {
    ops.randomizer = new Random(ops.seed || 0);
  }
  return ops.randomizer.next();
}

function _offset(
  min: number,
  max: number,
  ops: ResolvedOptions,
  roughnessGain = 1
): number {
  return ops.roughness * roughnessGain * (random(ops) * (max - min) + min);
}

function _offsetOpt(
  x: number,
  ops: ResolvedOptions,
  roughnessGain = 1
): number {
  return _offset(-x, x, ops, roughnessGain);
}

function _doubleLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  o: ResolvedOptions,
  filling = false
): Op[] {
  const singleStroke = filling
    ? o.disableMultiStrokeFill
    : o.disableMultiStroke;
  const o1 = _line(x1, y1, x2, y2, o, true, false);
  if (singleStroke) {
    return o1;
  }
  const o2 = _line(x1, y1, x2, y2, o, true, true);
  return o1.concat(o2);
}

function _line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  o: ResolvedOptions,
  move: boolean,
  overlay: boolean
): Op[] {
  const lengthSq = Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2);
  const length = Math.sqrt(lengthSq);
  let roughnessGain = 1;
  if (length < 200) {
    roughnessGain = 1;
  } else if (length > 500) {
    roughnessGain = 0.4;
  } else {
    roughnessGain = -0.0016668 * length + 1.233334;
  }

  let offset = o.maxRandomnessOffset || 0;
  if (offset * offset * 100 > lengthSq) {
    offset = length / 10;
  }
  const halfOffset = offset / 2;
  const divergePoint = 0.2 + random(o) * 0.2;
  let midDispX = (o.bowing * o.maxRandomnessOffset * (y2 - y1)) / 200;
  let midDispY = (o.bowing * o.maxRandomnessOffset * (x1 - x2)) / 200;
  midDispX = _offsetOpt(midDispX, o, roughnessGain);
  midDispY = _offsetOpt(midDispY, o, roughnessGain);
  const ops: Op[] = [];
  const randomHalf = () => _offsetOpt(halfOffset, o, roughnessGain);
  const randomFull = () => _offsetOpt(offset, o, roughnessGain);
  const preserveVertices = o.preserveVertices;
  if (move) {
    if (overlay) {
      ops.push({
        op: 'move',
        data: [
          x1 + (preserveVertices ? 0 : randomHalf()),
          y1 + (preserveVertices ? 0 : randomHalf()),
        ],
      });
    } else {
      ops.push({
        op: 'move',
        data: [
          x1 + (preserveVertices ? 0 : _offsetOpt(offset, o, roughnessGain)),
          y1 + (preserveVertices ? 0 : _offsetOpt(offset, o, roughnessGain)),
        ],
      });
    }
  }
  if (overlay) {
    ops.push({
      op: 'bcurveTo',
      data: [
        midDispX + x1 + (x2 - x1) * divergePoint + randomHalf(),
        midDispY + y1 + (y2 - y1) * divergePoint + randomHalf(),
        midDispX + x1 + 2 * (x2 - x1) * divergePoint + randomHalf(),
        midDispY + y1 + 2 * (y2 - y1) * divergePoint + randomHalf(),
        x2 + (preserveVertices ? 0 : randomHalf()),
        y2 + (preserveVertices ? 0 : randomHalf()),
      ],
    });
  } else {
    ops.push({
      op: 'bcurveTo',
      data: [
        midDispX + x1 + (x2 - x1) * divergePoint + randomFull(),
        midDispY + y1 + (y2 - y1) * divergePoint + randomFull(),
        midDispX + x1 + 2 * (x2 - x1) * divergePoint + randomFull(),
        midDispY + y1 + 2 * (y2 - y1) * divergePoint + randomFull(),
        x2 + (preserveVertices ? 0 : randomFull()),
        y2 + (preserveVertices ? 0 : randomFull()),
      ],
    });
  }
  return ops;
}

function _curveWithOffset(
  points: Point[],
  offset: number,
  o: ResolvedOptions
): Op[] {
  const ps: Point[] = [];
  ps.push([
    points[0][0] + _offsetOpt(offset, o),
    points[0][1] + _offsetOpt(offset, o),
  ]);
  ps.push([
    points[0][0] + _offsetOpt(offset, o),
    points[0][1] + _offsetOpt(offset, o),
  ]);
  for (let i = 1; i < points.length; i++) {
    ps.push([
      points[i][0] + _offsetOpt(offset, o),
      points[i][1] + _offsetOpt(offset, o),
    ]);
    if (i === points.length - 1) {
      ps.push([
        points[i][0] + _offsetOpt(offset, o),
        points[i][1] + _offsetOpt(offset, o),
      ]);
    }
  }
  return _curve(ps, null, o);
}

function _curve(
  points: Point[],
  closePoint: Point | null,
  o: ResolvedOptions
): Op[] {
  const len = points.length;
  const ops: Op[] = [];
  if (len > 3) {
    const b = [];
    const s = 1 - o.curveTightness;
    ops.push({ op: 'move', data: [points[1][0], points[1][1]] });
    for (let i = 1; i + 2 < len; i++) {
      const cachedVertArray = points[i];
      b[0] = [cachedVertArray[0], cachedVertArray[1]];
      b[1] = [
        cachedVertArray[0] + (s * points[i + 1][0] - s * points[i - 1][0]) / 6,
        cachedVertArray[1] + (s * points[i + 1][1] - s * points[i - 1][1]) / 6,
      ];
      b[2] = [
        points[i + 1][0] + (s * points[i][0] - s * points[i + 2][0]) / 6,
        points[i + 1][1] + (s * points[i][1] - s * points[i + 2][1]) / 6,
      ];
      b[3] = [points[i + 1][0], points[i + 1][1]];
      ops.push({
        op: 'bcurveTo',
        data: [b[1][0], b[1][1], b[2][0], b[2][1], b[3][0], b[3][1]],
      });
    }
    if (closePoint && closePoint.length === 2) {
      const ro = o.maxRandomnessOffset;
      ops.push({
        op: 'lineTo',
        data: [
          closePoint[0] + _offsetOpt(ro, o),
          closePoint[1] + _offsetOpt(ro, o),
        ],
      });
    }
  } else if (len === 3) {
    ops.push({ op: 'move', data: [points[1][0], points[1][1]] });
    ops.push({
      op: 'bcurveTo',
      data: [
        points[1][0],
        points[1][1],
        points[2][0],
        points[2][1],
        points[2][0],
        points[2][1],
      ],
    });
  } else if (len === 2) {
    ops.push(
      ..._doubleLine(points[0][0], points[0][1], points[1][0], points[1][1], o)
    );
  }
  return ops;
}

function _computeEllipsePoints(
  increment: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  offset: number,
  overlap: number,
  o: ResolvedOptions
): Point[][] {
  const coreOnly = o.roughness === 0;
  const corePoints: Point[] = [];
  const allPoints: Point[] = [];

  if (coreOnly) {
    increment = increment / 4;
    allPoints.push([
      cx + rx * Math.cos(-increment),
      cy + ry * Math.sin(-increment),
    ]);
    for (let angle = 0; angle <= Math.PI * 2; angle = angle + increment) {
      const p: Point = [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
      corePoints.push(p);
      allPoints.push(p);
    }
    allPoints.push([cx + rx * Math.cos(0), cy + ry * Math.sin(0)]);
    allPoints.push([
      cx + rx * Math.cos(increment),
      cy + ry * Math.sin(increment),
    ]);
  } else {
    const radOffset = _offsetOpt(0.5, o) - Math.PI / 2;
    allPoints.push([
      _offsetOpt(offset, o) + cx + 0.9 * rx * Math.cos(radOffset - increment),
      _offsetOpt(offset, o) + cy + 0.9 * ry * Math.sin(radOffset - increment),
    ]);
    const endAngle = Math.PI * 2 + radOffset - 0.01;
    for (let angle = radOffset; angle < endAngle; angle = angle + increment) {
      const p: Point = [
        _offsetOpt(offset, o) + cx + rx * Math.cos(angle),
        _offsetOpt(offset, o) + cy + ry * Math.sin(angle),
      ];
      corePoints.push(p);
      allPoints.push(p);
    }
    allPoints.push([
      _offsetOpt(offset, o) +
        cx +
        rx * Math.cos(radOffset + Math.PI * 2 + overlap * 0.5),
      _offsetOpt(offset, o) +
        cy +
        ry * Math.sin(radOffset + Math.PI * 2 + overlap * 0.5),
    ]);
    allPoints.push([
      _offsetOpt(offset, o) + cx + 0.98 * rx * Math.cos(radOffset + overlap),
      _offsetOpt(offset, o) + cy + 0.98 * ry * Math.sin(radOffset + overlap),
    ]);
    allPoints.push([
      _offsetOpt(offset, o) +
        cx +
        0.9 * rx * Math.cos(radOffset + overlap * 0.5),
      _offsetOpt(offset, o) +
        cy +
        0.9 * ry * Math.sin(radOffset + overlap * 0.5),
    ]);
  }

  return [allPoints, corePoints];
}

function _arc(
  increment: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  strt: number,
  stp: number,
  offset: number,
  o: ResolvedOptions
) {
  const radOffset = strt + _offsetOpt(0.1, o);
  const points: Point[] = [];
  points.push([
    _offsetOpt(offset, o) + cx + 0.9 * rx * Math.cos(radOffset - increment),
    _offsetOpt(offset, o) + cy + 0.9 * ry * Math.sin(radOffset - increment),
  ]);
  for (let angle = radOffset; angle <= stp; angle = angle + increment) {
    points.push([
      _offsetOpt(offset, o) + cx + rx * Math.cos(angle),
      _offsetOpt(offset, o) + cy + ry * Math.sin(angle),
    ]);
  }
  points.push([cx + rx * Math.cos(stp), cy + ry * Math.sin(stp)]);
  points.push([cx + rx * Math.cos(stp), cy + ry * Math.sin(stp)]);
  return _curve(points, null, o);
}

function _bezierTo(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number,
  current: Point,
  o: ResolvedOptions
): Op[] {
  const ops: Op[] = [];
  const ros = [o.maxRandomnessOffset || 1, (o.maxRandomnessOffset || 1) + 0.3];
  let f: Point = [0, 0];
  const iterations = o.disableMultiStroke ? 1 : 2;
  const preserveVertices = o.preserveVertices;
  for (let i = 0; i < iterations; i++) {
    if (i === 0) {
      ops.push({ op: 'move', data: [current[0], current[1]] });
    } else {
      ops.push({
        op: 'move',
        data: [
          current[0] + (preserveVertices ? 0 : _offsetOpt(ros[0], o)),
          current[1] + (preserveVertices ? 0 : _offsetOpt(ros[0], o)),
        ],
      });
    }
    f = preserveVertices
      ? [x, y]
      : [x + _offsetOpt(ros[i], o), y + _offsetOpt(ros[i], o)];
    ops.push({
      op: 'bcurveTo',
      data: [
        x1 + _offsetOpt(ros[i], o),
        y1 + _offsetOpt(ros[i], o),
        x2 + _offsetOpt(ros[i], o),
        y2 + _offsetOpt(ros[i], o),
        f[0],
        f[1],
      ],
    });
  }
  return ops;
}
