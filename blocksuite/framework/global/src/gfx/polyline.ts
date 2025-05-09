import { type IVec, Vec } from './model/index.js';

export class Polyline {
  static len(points: IVec[]) {
    const n = points.length;

    if (n < 2) {
      return 0;
    }

    let i = 0;
    let len = 0;
    let curr: IVec;
    let prev = points[0];

    while (++i < n) {
      curr = points[i];
      len += Vec.dist(prev, curr);
      prev = curr;
    }

    return len;
  }

  static lenAtPoint(points: IVec[], point: IVec) {
    const n = points.length;
    let len = n;

    for (let i = 0; i < n - 1; i++) {
      const a = points[i];
      const b = points[i + 1];

      // start
      if (a[0] === point[0] && a[1] === point[1]) {
        return len;
      }

      const aa = Vec.angle(a, point);
      const ba = Vec.angle(b, point);

      if ((aa + ba) % Math.PI === 0) {
        len += Vec.dist(a, point);
        return len;
      }

      len += Vec.dist(a, b);

      // end
      if (b[0] === point[0] && b[1] === point[1]) {
        return len;
      }
    }

    return len;
  }

  static nearestPoint(points: IVec[], point: IVec): IVec {
    const n = points.length;
    const r: IVec = [0, 0];
    let len = Infinity;

    for (let i = 0; i < n - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const p = Vec.nearestPointOnLineSegment(a, b, point, true);
      const d = Vec.dist(p, point);
      if (d < len) {
        len = d;
        r[0] = p[0];
        r[1] = p[1];
      }
    }

    return r;
  }

  static pointAt(points: IVec[], ratio: number) {
    const n = points.length;

    if (n === 0) {
      return null;
    }

    if (n === 1) {
      return points[0];
    }

    if (ratio <= 0) {
      return points[0];
    }

    if (ratio >= 1) {
      return points[n - 1];
    }

    const total = Polyline.len(points);
    const len = total * ratio;
    return Polyline.pointAtLen(points, len);
  }

  static pointAtLen(points: IVec[], len: number): IVec | null {
    const n = points.length;

    if (n === 0) {
      return null;
    }

    if (n === 1) {
      return points[0];
    }

    let fromStart = true;
    if (len < 0) {
      fromStart = false;
      len = -len;
    }

    let tmp = 0;
    for (let j = 0, k = n - 1; j < k; j++) {
      const i = fromStart ? j : k - 1 - j;
      const a = points[i];
      const b = points[i + 1];
      const d = Vec.dist(a, b);

      if (len <= tmp + d) {
        const t = ((fromStart ? 1 : -1) * (len - tmp)) / d;
        return Vec.lrp(a, b, t) as IVec;
      }

      tmp += d;
    }

    const lastPoint = fromStart ? points[n - 1] : points[0];
    return lastPoint;
  }
}
