// control coords are not relative to start or end
import { CURVETIME_EPSILON, isZero } from './math.js';
import { Bound, type IVec, PointLocation, Vec } from './model/index.js';

export type BezierCurveParameters = [
  start: IVec,
  control1: IVec,
  control2: IVec,
  end: IVec,
];

function evaluate(
  v: BezierCurveParameters,
  t: number,
  type: number,
  normalized: boolean
): IVec | null {
  if (t == null || t < 0 || t > 1) return null;
  const x0 = v[0][0],
    y0 = v[0][1],
    x3 = v[3][0],
    y3 = v[3][1];
  let x1 = v[1][0],
    y1 = v[1][1],
    x2 = v[2][0],
    y2 = v[2][1];

  if (isZero(x1 - x0) && isZero(y1 - y0)) {
    x1 = x0;
    y1 = y0;
  }
  if (isZero(x2 - x3) && isZero(y2 - y3)) {
    x2 = x3;
    y2 = y3;
  }
  // Calculate the polynomial coefficients.
  const cx = 3 * (x1 - x0),
    bx = 3 * (x2 - x1) - cx,
    ax = x3 - x0 - cx - bx,
    cy = 3 * (y1 - y0),
    by = 3 * (y2 - y1) - cy,
    ay = y3 - y0 - cy - by;
  let x, y;
  if (type === 0) {
    // type === 0: getPoint()
    x = t === 0 ? x0 : t === 1 ? x3 : ((ax * t + bx) * t + cx) * t + x0;
    y = t === 0 ? y0 : t === 1 ? y3 : ((ay * t + by) * t + cy) * t + y0;
  } else {
    // type === 1: getTangent()
    // type === 2: getNormal()
    // type === 3: getCurvature()
    const tMin = CURVETIME_EPSILON,
      tMax = 1 - tMin;
    if (t < tMin) {
      x = cx;
      y = cy;
    } else if (t > tMax) {
      x = 3 * (x3 - x2);
      y = 3 * (y3 - y2);
    } else {
      x = (3 * ax * t + 2 * bx) * t + cx;
      y = (3 * ay * t + 2 * by) * t + cy;
    }
    if (normalized) {
      if (x === 0 && y === 0 && (t < tMin || t > tMax)) {
        x = x2 - x1;
        y = y2 - y1;
      }
      const len = Math.sqrt(x * x + y * y);
      if (len) {
        x /= len;
        y /= len;
      }
    }
    if (type === 3) {
      const x2 = 6 * ax * t + 2 * bx,
        y2 = 6 * ay * t + 2 * by,
        d = Math.pow(x * x + y * y, 3 / 2);
      x = d !== 0 ? (x * y2 - y * x2) / d : 0;
      y = 0;
    }
  }
  return type === 2 ? [y, -x] : [x, y];
}

export function getBezierPoint(values: BezierCurveParameters, t: number) {
  return evaluate(values, t, 0, false);
}

export function getBezierTangent(values: BezierCurveParameters, t: number) {
  return evaluate(values, t, 1, true);
}

export function getBezierNormal(values: BezierCurveParameters, t: number) {
  return evaluate(values, t, 2, true);
}

export function getBezierCurvature(values: BezierCurveParameters, t: number) {
  return evaluate(values, t, 3, false)?.[0];
}

export function getBezierNearestTime(
  values: BezierCurveParameters,
  point: IVec
) {
  const count = 100;
  let minDist = Infinity,
    minT = 0;

  function refine(t: number) {
    if (t >= 0 && t <= 1) {
      const tmpPoint = getBezierPoint(values, t);
      if (!tmpPoint) return false;
      const dist = Vec.dist2(point, tmpPoint);
      if (dist < minDist) {
        minDist = dist;
        minT = t;
        return true;
      }
    }
    return false;
  }

  for (let i = 0; i <= count; i++) refine(i / count);

  let step = 1 / (count * 2);
  while (step > CURVETIME_EPSILON) {
    if (!refine(minT - step) && !refine(minT + step)) step /= 2;
  }
  return minT;
}

export function getBezierNearestPoint(
  values: BezierCurveParameters,
  point: IVec
) {
  const t = getBezierNearestTime(values, point);
  const pointOnCurve = getBezierPoint(values, t);
  return pointOnCurve;
}

export function getBezierParameters(
  points: PointLocation[]
): BezierCurveParameters {
  // Fallback for degenerate Bezier curve (all points are at the same position)
  if (points.length === 1) {
    const point = points[0];
    return [point, point, point, point];
  }

  return [points[0], points[0].absOut, points[1].absIn, points[1]];
}

// https://stackoverflow.com/questions/2587751/an-algorithm-to-find-bounding-box-of-closed-bezier-curves
export function getBezierCurveBoundingBox(values: BezierCurveParameters) {
  const [start, controlPoint1, controlPoint2, end] = values;

  const [x0, y0] = start;
  const [x1, y1] = controlPoint1;
  const [x2, y2] = controlPoint2;
  const [x3, y3] = end;

  const points = []; // local extremes
  const tvalues = []; // t values of local extremes
  const bounds: [number[], number[]] = [[], []];

  let a;
  let b;
  let c;
  let t;
  let t1;
  let t2;
  let b2ac;
  let sqrtb2ac;

  for (let i = 0; i < 2; i += 1) {
    if (i === 0) {
      b = 6 * x0 - 12 * x1 + 6 * x2;
      a = -3 * x0 + 9 * x1 - 9 * x2 + 3 * x3;
      c = 3 * x1 - 3 * x0;
    } else {
      b = 6 * y0 - 12 * y1 + 6 * y2;
      a = -3 * y0 + 9 * y1 - 9 * y2 + 3 * y3;
      c = 3 * y1 - 3 * y0;
    }

    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) < 1e-12) {
        continue;
      }

      t = -c / b;
      if (t > 0 && t < 1) tvalues.push(t);

      continue;
    }

    b2ac = b * b - 4 * c * a;
    sqrtb2ac = Math.sqrt(b2ac);

    if (b2ac < 0) continue;

    t1 = (-b + sqrtb2ac) / (2 * a);
    if (t1 > 0 && t1 < 1) tvalues.push(t1);

    t2 = (-b - sqrtb2ac) / (2 * a);
    if (t2 > 0 && t2 < 1) tvalues.push(t2);
  }

  let x;
  let y;
  let mt;
  let j = tvalues.length;
  const jlen = j;

  while (j) {
    j -= 1;
    t = tvalues[j];
    mt = 1 - t;

    x =
      mt * mt * mt * x0 +
      3 * mt * mt * t * x1 +
      3 * mt * t * t * x2 +
      t * t * t * x3;
    bounds[0][j] = x;

    y =
      mt * mt * mt * y0 +
      3 * mt * mt * t * y1 +
      3 * mt * t * t * y2 +
      t * t * t * y3;

    bounds[1][j] = y;
    points[j] = { X: x, Y: y };
  }

  tvalues[jlen] = 0;
  tvalues[jlen + 1] = 1;

  points[jlen] = { X: x0, Y: y0 };
  points[jlen + 1] = { X: x3, Y: y3 };

  bounds[0][jlen] = x0;
  bounds[1][jlen] = y0;

  bounds[0][jlen + 1] = x3;
  bounds[1][jlen + 1] = y3;

  tvalues.length = jlen + 2;
  bounds[0].length = jlen + 2;
  bounds[1].length = jlen + 2;
  points.length = jlen + 2;

  const left = Math.min.apply(null, bounds[0]);
  const top = Math.min.apply(null, bounds[1]);
  const right = Math.max.apply(null, bounds[0]);
  const bottom = Math.max.apply(null, bounds[1]);

  return new Bound(left, top, right - left, bottom - top);
}

// https://pomax.github.io/bezierjs/#intersect-line
// MIT Licence

// cube root function yielding real roots
function crt(v: number) {
  return v < 0 ? -Math.pow(-v, 1 / 3) : Math.pow(v, 1 / 3);
}

function align(points: BezierCurveParameters, [start, end]: IVec[]) {
  const tx = start[0],
    ty = start[1],
    a = -Math.atan2(end[1] - ty, end[0] - tx),
    d = function ([x, y]: IVec) {
      return [
        (x - tx) * Math.cos(a) - (y - ty) * Math.sin(a),
        (x - tx) * Math.sin(a) + (y - ty) * Math.cos(a),
      ];
    };
  return points.map(d);
}

function between(v: number, min: number, max: number) {
  return (
    (min <= v && v <= max) || approximately(v, min) || approximately(v, max)
  );
}

function approximately(
  a: number,
  b: number,
  precision?: number,
  epsilon = 0.000001
) {
  return Math.abs(a - b) <= (precision || epsilon);
}

function roots(points: BezierCurveParameters, line: IVec[]) {
  const order = points.length - 1;
  const aligned = align(points, line);
  const reduce = function (t: number) {
    return 0 <= t && t <= 1;
  };

  if (order === 2) {
    const a = aligned[0][1],
      b = aligned[1][1],
      c = aligned[2][1],
      d = a - 2 * b + c;
    if (d !== 0) {
      const m1 = -Math.sqrt(b * b - a * c),
        m2 = -a + b,
        v1 = -(m1 + m2) / d,
        v2 = -(-m1 + m2) / d;
      return [v1, v2].filter(reduce);
    } else if (b !== c && d === 0) {
      return [(2 * b - c) / (2 * b - 2 * c)].filter(reduce);
    }
    return [];
  }

  // see http://www.trans4mind.com/personal_development/mathematics/polynomials/cubicAlgebra.htm
  const pa = aligned[0][1],
    pb = aligned[1][1],
    pc = aligned[2][1],
    pd = aligned[3][1];

  const d = -pa + 3 * pb - 3 * pc + pd;
  let a = 3 * pa - 6 * pb + 3 * pc,
    b = -3 * pa + 3 * pb,
    c = pa;

  if (approximately(d, 0)) {
    // this is not a cubic curve.
    if (approximately(a, 0)) {
      // in fact, this is not a quadratic curve either.
      if (approximately(b, 0)) {
        // in fact in fact, there are no solutions.
        return [];
      }
      // linear solution:
      return [-c / b].filter(reduce);
    }
    // quadratic solution:
    const q = Math.sqrt(b * b - 4 * a * c),
      a2 = 2 * a;
    return [(q - b) / a2, (-b - q) / a2].filter(reduce);
  }

  // at this point, we know we need a cubic solution:

  a /= d;
  b /= d;
  c /= d;

  const p = (3 * b - a * a) / 3,
    p3 = p / 3,
    q = (2 * a * a * a - 9 * a * b + 27 * c) / 27,
    q2 = q / 2,
    discriminant = q2 * q2 + p3 * p3 * p3;

  let u1, v1, x1, x2, x3;
  if (discriminant < 0) {
    const mp3 = -p / 3,
      mp33 = mp3 * mp3 * mp3,
      r = Math.sqrt(mp33),
      t = -q / (2 * r),
      cosphi = t < -1 ? -1 : t > 1 ? 1 : t,
      phi = Math.acos(cosphi),
      crtr = crt(r),
      t1 = 2 * crtr;
    x1 = t1 * Math.cos(phi / 3) - a / 3;
    x2 = t1 * Math.cos((phi + Math.PI * 2) / 3) - a / 3;
    x3 = t1 * Math.cos((phi + 2 * Math.PI * 2) / 3) - a / 3;
    return [x1, x2, x3].filter(reduce);
  } else if (discriminant === 0) {
    u1 = q2 < 0 ? crt(-q2) : -crt(q2);
    x1 = 2 * u1 - a / 3;
    x2 = -u1 - a / 3;
    return [x1, x2].filter(reduce);
  } else {
    const sd = Math.sqrt(discriminant);
    u1 = crt(-q2 + sd);
    v1 = crt(q2 + sd);
    return [u1 - v1 - a / 3].filter(reduce);
  }
}

export function curveIntersects(path: PointLocation[], line: [IVec, IVec]) {
  const { minX, maxX, minY, maxY } = Bound.fromPoints(line);
  const points = getBezierParameters(path);
  const intersectedPoints = roots(points, line)
    .map(t => getBezierPoint(points, t))
    .filter(point =>
      point
        ? between(point[0], minX, maxX) && between(point[1], minY, maxY)
        : false
    )
    .map(point => new PointLocation(point!));
  return intersectedPoints.length > 0 ? intersectedPoints : null;
}
