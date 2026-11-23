import { absolutize } from '../path-data-parser/absolutize.js';
import { normalize } from '../path-data-parser/normalize.js';
import { parsePath } from '../path-data-parser/parser.js';
import { pointsOnBezierCurves, simplify } from '../points-on-curve/index.js';
import type { Point } from '../rough/geometry.js';

export function pointsOnPath(
  path: string,
  tolerance?: number,
  distance?: number
): Point[][] {
  const segments = parsePath(path);
  const normalized = normalize(absolutize(segments));

  const sets: Point[][] = [];
  let currentPoints: Point[] = [];
  let start: Point = [0, 0];
  let pendingCurve: Point[] = [];

  const appendPendingCurve = () => {
    if (pendingCurve.length >= 4) {
      currentPoints.push(...pointsOnBezierCurves(pendingCurve, tolerance));
    }
    pendingCurve = [];
  };

  const appendPendingPoints = () => {
    appendPendingCurve();
    if (currentPoints.length) {
      sets.push(currentPoints);
      currentPoints = [];
    }
  };

  for (const { key, data } of normalized) {
    switch (key) {
      case 'M':
        appendPendingPoints();
        start = [data[0], data[1]];
        currentPoints.push(start);
        break;
      case 'L':
        appendPendingCurve();
        currentPoints.push([data[0], data[1]]);
        break;
      case 'C':
        if (!pendingCurve.length) {
          const lastPoint = currentPoints.length
            ? currentPoints[currentPoints.length - 1]
            : start;
          pendingCurve.push([lastPoint[0], lastPoint[1]]);
        }
        pendingCurve.push([data[0], data[1]]);
        pendingCurve.push([data[2], data[3]]);
        pendingCurve.push([data[4], data[5]]);
        break;
      case 'Z':
        appendPendingCurve();
        currentPoints.push([start[0], start[1]]);
        break;
    }
  }
  appendPendingPoints();

  if (!distance) {
    return sets;
  }

  const out: Point[][] = [];
  for (const set of sets) {
    const simplifiedSet = simplify(set, distance);
    if (simplifiedSet.length) {
      out.push(simplifiedSet);
    }
  }
  return out;
}
