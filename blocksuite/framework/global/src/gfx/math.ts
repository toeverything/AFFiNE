import type { Bound, IBound } from './model/bound.js';
import { PointLocation } from './model/point-location.js';
import { type IVec, Vec } from './model/vec.js';

export const EPSILON = 1e-12;
export const MACHINE_EPSILON = 1.12e-16;
export const PI2 = Math.PI * 2;
export const CURVETIME_EPSILON = 1e-8;

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * Calculates the intersection point of two line segments.
 *
 * @param sp - Start point of the first line segment [x, y]
 * @param ep - End point of the first line segment [x, y]
 * @param sp2 - Start point of the second line segment [x, y]
 * @param ep2 - End point of the second line segment [x, y]
 * @param infinite - If true, treats the lines as infinite lines rather than line segments
 * @returns The intersection point [x, y] if the lines intersect, null if they are parallel or coincident
 *
 * @example
 * const intersection = lineIntersects([0, 0], [2, 2], [0, 2], [2, 0]);
 * // Returns [1, 1] - the intersection point of the two line segments
 *
 * @example
 * const parallel = lineIntersects([0, 0], [2, 2], [0, 1], [2, 3], true);
 * // Returns null - the lines are parallel
 */
export function lineIntersects(
  sp: IVec,
  ep: IVec,
  sp2: IVec,
  ep2: IVec,
  infinite = false
): IVec | null {
  const v1 = Vec.sub(ep, sp);
  const v2 = Vec.sub(ep2, sp2);
  const cross = Vec.cpr(v1, v2);
  // Avoid divisions by 0, and errors when getting too close to 0
  if (almostEqual(cross, 0, MACHINE_EPSILON)) return null;
  const d = Vec.sub(sp, sp2);
  let u1 = Vec.cpr(v2, d) / cross;
  const u2 = Vec.cpr(v1, d) / cross,
    // Check the ranges of the u parameters if the line is not
    // allowed to extend beyond the definition points, but
    // compare with EPSILON tolerance over the [0, 1] bounds.
    epsilon = /*#=*/ EPSILON,
    uMin = -epsilon,
    uMax = 1 + epsilon;

  if (infinite || (uMin < u1 && u1 < uMax && uMin < u2 && u2 < uMax)) {
    // Address the tolerance at the bounds by clipping to
    // the actual range.
    if (!infinite) {
      u1 = clamp(u1, 0, 1);
    }
    return Vec.lrp(sp, ep, u1);
  }

  return null;
}

/**
 * Finds the nearest point on a polygon to a given point.
 *
 * @param points - Array of points defining the polygon vertices [x, y][]
 * @param point - The point to find the nearest point to [x, y]
 * @returns The nearest point on the polygon to the given point
 * @throws Error if points array is empty or has less than 2 points
 */
export function polygonNearestPoint(points: IVec[], point: IVec) {
  const len = points.length;
  if (len < 2) {
    throw new Error('Polygon must have at least 2 points');
  }

  let rst: IVec = points[0]; // Initialize with first point as fallback
  let dis = Vec.dist(points[0], point);

  for (let i = 0; i < len; i++) {
    const p = points[i];
    const p2 = points[(i + 1) % len];
    const temp = Vec.nearestPointOnLineSegment(p, p2, point, true);
    const curDis = Vec.dist(temp, point);
    if (curDis < dis) {
      dis = curDis;
      rst = temp;
    }
  }
  return rst;
}

export function polygonPointDistance(points: IVec[], point: IVec) {
  const nearest = polygonNearestPoint(points, point);
  return Vec.dist(nearest, point);
}

export function rotatePoints<T extends IVec>(
  points: T[],
  center: IVec,
  rotate: number
): T[] {
  const rad = toRadian(rotate);
  return points.map(p => Vec.rotWith(p, center, rad)) as T[];
}

export function rotatePoint(
  point: [number, number],
  center: IVec,
  rotate: number
): [number, number] {
  const rad = toRadian(rotate);
  return Vec.add(center, Vec.rot(Vec.sub(point, center), rad)) as [
    number,
    number,
  ];
}

export function toRadian(angle: number) {
  return (angle * Math.PI) / 180;
}

export function isPointOnLineSegment(point: IVec, line: IVec[]) {
  const [sp, ep] = line;
  const v1 = Vec.sub(point, sp);
  const v2 = Vec.sub(point, ep);
  return almostEqual(Vec.cpr(v1, v2), 0, 0.01) && Vec.dpr(v1, v2) <= 0;
}

export function polygonGetPointTangent(points: IVec[], point: IVec): IVec {
  const len = points.length;
  for (let i = 0; i < len; i++) {
    const p = points[i];
    const p2 = points[(i + 1) % len];
    if (isPointOnLineSegment(point, [p, p2])) {
      return Vec.normalize(Vec.sub(p2, p));
    }
  }
  return [0, 0];
}

export function linePolygonIntersects(
  sp: IVec,
  ep: IVec,
  points: IVec[]
): PointLocation[] | null {
  const result: PointLocation[] = [];
  const len = points.length;

  for (let i = 0; i < len; i++) {
    const p = points[i];
    const p2 = points[(i + 1) % len];
    const rst = lineIntersects(sp, ep, p, p2);
    if (rst) {
      const v = new PointLocation(rst);
      v.tangent = Vec.normalize(Vec.sub(p2, p));
      result.push(v);
    }
  }

  return result.length ? result : null;
}

export function linePolylineIntersects(
  sp: IVec,
  ep: IVec,
  points: IVec[]
): PointLocation[] | null {
  const result: PointLocation[] = [];
  const len = points.length;

  for (let i = 0; i < len - 1; i++) {
    const p = points[i];
    const p2 = points[i + 1];
    const rst = lineIntersects(sp, ep, p, p2);
    if (rst) {
      result.push(new PointLocation(rst, Vec.normalize(Vec.sub(p2, p))));
    }
  }

  return result.length ? result : null;
}

export function polyLineNearestPoint(points: IVec[], point: IVec) {
  const len = points.length;
  let rst: IVec;
  let dis = Infinity;
  for (let i = 0; i < len - 1; i++) {
    const p = points[i];
    const p2 = points[i + 1];
    const temp = Vec.nearestPointOnLineSegment(p, p2, point, true);
    const curDis = Vec.dist(temp, point);
    if (curDis < dis) {
      dis = curDis;
      rst = temp;
    }
  }
  return rst!;
}

export function isPointOnlines(
  element: Bound,
  points: readonly [number, number][],
  rotate: number,
  hitPoint: [number, number],
  threshold: number
): boolean {
  // credit to Excalidraw hitTestFreeDrawElement

  let x: number;
  let y: number;

  if (rotate === 0) {
    x = hitPoint[0] - element.x;
    y = hitPoint[1] - element.y;
  } else {
    // Counter-rotate the point around center before testing
    const { minX, minY, maxX, maxY } = element;
    const rotatedPoint = rotatePoint(
      hitPoint,
      [minX + (maxX - minX) / 2, minY + (maxY - minY) / 2],
      -rotate
    ) as [number, number];
    x = rotatedPoint[0] - element.x;
    y = rotatedPoint[1] - element.y;
  }

  let [A, B] = points;
  let P: readonly [number, number];

  // For freedraw dots
  if (
    distance2d(A[0], A[1], x, y) < threshold ||
    distance2d(B[0], B[1], x, y) < threshold
  ) {
    return true;
  }

  // For freedraw lines
  for (let i = 0; i < points.length; i++) {
    const delta = [B[0] - A[0], B[1] - A[1]];
    const length = Math.hypot(delta[1], delta[0]);

    const U = [delta[0] / length, delta[1] / length];
    const C = [x - A[0], y - A[1]];
    const d = (C[0] * U[0] + C[1] * U[1]) / Math.hypot(U[1], U[0]);
    P = [A[0] + U[0] * d, A[1] + U[1] * d];

    const da = distance2d(P[0], P[1], A[0], A[1]);
    const db = distance2d(P[0], P[1], B[0], B[1]);

    P = db < da && da > length ? B : da < db && db > length ? A : P;

    if (Math.hypot(y - P[1], x - P[0]) < threshold) {
      return true;
    }

    A = B;
    B = points[i + 1];
  }

  return false;
}

export const distance2d = (x1: number, y1: number, x2: number, y2: number) => {
  const xd = x2 - x1;
  const yd = y2 - y1;
  return Math.hypot(xd, yd);
};

function square(num: number) {
  return num * num;
}

function sumSqr(v: IVec, w: IVec) {
  return square(v[0] - w[0]) + square(v[1] - w[1]);
}

function distToSegmentSquared(p: IVec, v: IVec, w: IVec) {
  const l2 = sumSqr(v, w);

  if (l2 == 0) return sumSqr(p, v);
  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;

  t = Math.max(0, Math.min(1, t));

  return sumSqr(p, [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])]);
}

function distToSegment(p: IVec, v: IVec, w: IVec) {
  return Math.sqrt(distToSegmentSquared(p, v, w));
}

export function isPointIn(a: IBound, x: number, y: number): boolean {
  return a.x <= x && x <= a.x + a.w && a.y <= y && y <= a.y + a.h;
}

export function intersects(a: IBound, b: IBound): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function almostEqual(a: number, b: number, epsilon = 0.0001) {
  return Math.abs(a - b) < epsilon;
}

export function isVecZero(v: IVec) {
  return v.every(n => isZero(n));
}

export function isZero(x: number) {
  return x >= -EPSILON && x <= EPSILON;
}

export function pointAlmostEqual(a: IVec, b: IVec, _epsilon = 0.0001) {
  return a.length === b.length && a.every((v, i) => almostEqual(v, b[i]));
}

export function clamp(n: number, min: number, max?: number): number {
  return Math.max(min, max !== undefined ? Math.min(n, max) : n);
}

export function pointInEllipse(
  A: IVec,
  C: IVec,
  rx: number,
  ry: number,
  rotation = 0
): boolean {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const delta = Vec.sub(A, C);
  const tdx = cos * delta[0] + sin * delta[1];
  const tdy = sin * delta[0] - cos * delta[1];

  return (tdx * tdx) / (rx * rx) + (tdy * tdy) / (ry * ry) <= 1;
}

export function pointInPolygon(p: IVec, points: IVec[]): boolean {
  let wn = 0; // winding number

  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    if (a[1] <= p[1]) {
      if (b[1] > p[1] && Vec.cross(a, b, p) > 0) {
        wn += 1;
      }
    } else if (b[1] <= p[1] && Vec.cross(a, b, p) < 0) {
      wn -= 1;
    }
  });

  return wn !== 0;
}

export function pointOnEllipse(
  point: IVec,
  rx: number,
  ry: number,
  threshold: number
): boolean {
  // slope of point
  const t = point[1] / point[0];
  const squaredX =
    (square(rx) * square(ry)) / (square(rx) * square(t) + square(ry));
  const squaredY =
    (square(rx) * square(ry) - square(ry) * squaredX) / square(rx);

  return (
    Math.abs(
      Math.sqrt(square(point[1]) + square(point[0])) -
        Math.sqrt(squaredX + squaredY)
    ) < threshold
  );
}

export function pointOnPolygonStoke(
  p: IVec,
  points: IVec[],
  threshold: number
): boolean {
  for (let i = 0; i < points.length; ++i) {
    const next = i + 1 === points.length ? 0 : i + 1;
    if (distToSegment(p, points[i], points[next]) <= threshold) {
      return true;
    }
  }

  return false;
}

export function getPolygonPathFromPoints(
  points: IVec[],
  closed = true
): string {
  const len = points.length;
  if (len < 2) return ``;

  const a = points[0];
  const b = points[1];

  let res = `M${a[0].toFixed(2)},${a[1].toFixed()}L${b[0].toFixed(2)},${b[1].toFixed()}`;

  for (let i = 2; i < len; i++) {
    const a = points[i];
    res += `L${a[0].toFixed(2)},${a[1].toFixed()}`;
  }

  if (closed) res += 'Z';
  return res;
}
export function getSvgPathFromStroke(points: IVec[], closed = true): string {
  const len = points.length;

  if (len < 4) {
    return ``;
  }

  let a = points[0];
  let b = points[1];
  const c = points[2];

  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(
    2
  )},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(
    b[1],
    c[1]
  ).toFixed(2)} T`;

  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(
      2
    )} `;
  }

  if (closed) {
    result += 'Z';
  }

  return result;
}

function average(a: number, b: number): number {
  return (a + b) / 2;
}

//reference https://www.xarg.org/book/computer-graphics/line-segment-ellipse-intersection/
export function lineEllipseIntersects(
  A: IVec,
  B: IVec,
  C: IVec,
  rx: number,
  ry: number,
  rad = 0
) {
  A = Vec.rot(Vec.sub(A, C), -rad);
  B = Vec.rot(Vec.sub(B, C), -rad);

  rx *= rx;
  ry *= ry;

  const rst: IVec[] = [];

  const v = Vec.sub(B, A);

  const a = rx * v[1] * v[1] + ry * v[0] * v[0];
  const b = 2 * (rx * A[1] * v[1] + ry * A[0] * v[0]);
  const c = rx * A[1] * A[1] + ry * A[0] * A[0] - rx * ry;

  const D = b * b - 4 * a * c; // Discriminant

  if (D >= 0) {
    const sqrtD = Math.sqrt(D);
    const t1 = (-b + sqrtD) / (2 * a);
    const t2 = (-b - sqrtD) / (2 * a);

    if (0 <= t1 && t1 <= 1)
      rst.push(Vec.add(Vec.rot(Vec.add(Vec.mul(v, t1), A), rad), C));

    if (0 <= t2 && t2 <= 1 && Math.abs(t1 - t2) > 1e-16)
      rst.push(Vec.add(Vec.rot(Vec.add(Vec.mul(v, t2), A), rad), C));
  }

  if (rst.length === 0) return null;

  return rst.map(v => {
    const pl = new PointLocation(v);
    const normalVector = Vec.uni(Vec.divV(Vec.sub(v, C), [rx * rx, ry * ry]));
    pl.tangent = [-normalVector[1], normalVector[0]];
    return pl;
  });
}

export function sign(number: number) {
  return number > 0 ? 1 : -1;
}

export function getPointFromBoundsWithRotation(
  bounds: IBound,
  point: IVec
): IVec {
  const { x, y, w, h, rotate } = bounds;

  if (!rotate) return point;

  const cx = x + w / 2;
  const cy = y + h / 2;

  const m = new DOMMatrix()
    .translateSelf(cx, cy)
    .rotateSelf(rotate)
    .translateSelf(-cx, -cy);

  const p = new DOMPoint(...point).matrixTransform(m);
  return [p.x, p.y];
}

export function normalizeDegAngle(angle: number) {
  if (angle < 0) angle += 360;
  angle %= 360;
  return angle;
}

export function toDegree(radian: number) {
  return (radian * 180) / Math.PI;
}

// 0 means x axis, 1 means y axis
export function isOverlap(
  line1: IVec[],
  line2: IVec[],
  axis: 0 | 1,
  strict = true
) {
  const less = strict
    ? (a: number, b: number) => a < b
    : (a: number, b: number) => a <= b;
  return !(
    less(
      Math.max(line1[0][axis], line1[1][axis]),
      Math.min(line2[0][axis], line2[1][axis])
    ) ||
    less(
      Math.max(line2[0][axis], line2[1][axis]),
      Math.min(line1[0][axis], line1[1][axis])
    )
  );
}

export function getCenterAreaBounds(bounds: IBound, ratio: number) {
  const { x, y, w, h, rotate } = bounds;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const nw = w * ratio;
  const nh = h * ratio;
  return {
    x: cx - nw / 2,
    y: cy - nh / 2,
    w: nw,
    h: nh,
    rotate,
  };
}
