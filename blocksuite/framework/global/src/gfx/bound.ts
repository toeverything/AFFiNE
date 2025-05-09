import { Bound, getIBoundFromPoints, type IBound } from './model/bound.js';
import { type IVec } from './model/vec.js';

function getExpandedBound(a: IBound, b: IBound): IBound {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  const width = Math.abs(maxX - minX);
  const height = Math.abs(maxY - minY);

  return {
    x: minX,
    y: minY,
    w: width,
    h: height,
  };
}

export function getPointsFromBoundWithRotation(
  bounds: IBound,
  getPoints: (bounds: IBound) => IVec[] = ({ x, y, w, h }: IBound) => [
    // left-top
    [x, y],
    // right-top
    [x + w, y],
    // right-bottom
    [x + w, y + h],
    // left-bottom
    [x, y + h],
  ],
  resPadding: [number, number] = [0, 0]
): IVec[] {
  const { rotate } = bounds;
  let points = getPoints({
    x: bounds.x - resPadding[1],
    y: bounds.y - resPadding[0],
    w: bounds.w + resPadding[1] * 2,
    h: bounds.h + resPadding[0] * 2,
  });

  if (rotate) {
    const { x, y, w, h } = bounds;
    const cx = x + w / 2;
    const cy = y + h / 2;

    const m = new DOMMatrix()
      .translateSelf(cx, cy)
      .rotateSelf(rotate)
      .translateSelf(-cx, -cy);

    points = points.map(point => {
      const { x, y } = new DOMPoint(...point).matrixTransform(m);
      return [x, y];
    });
  }

  return points;
}

export function getQuadBoundWithRotation(bounds: IBound): DOMRect {
  const { x, y, w, h, rotate } = bounds;
  const rect = new DOMRect(x, y, w, h);

  if (!rotate) return rect;

  return new DOMQuad(
    ...getPointsFromBoundWithRotation(bounds).map(
      point => new DOMPoint(...point)
    )
  ).getBounds();
}

export function getBoundWithRotation(bound: IBound): IBound {
  const { x, y, width: w, height: h } = getQuadBoundWithRotation(bound);
  return { x, y, w, h };
}

/**
 * Returns the common bound of the given bounds.
 * The rotation of the bounds is not considered.
 * @param bounds
 * @returns
 */
export function getCommonBound(bounds: IBound[]): Bound | null {
  if (!bounds.length) {
    return null;
  }

  if (bounds.length === 1) {
    const { x, y, w, h } = bounds[0];
    return new Bound(x, y, w, h);
  }

  let result = bounds[0];

  for (let i = 1; i < bounds.length; i++) {
    result = getExpandedBound(result, bounds[i]);
  }

  return new Bound(result.x, result.y, result.w, result.h);
}

/**
 * Like `getCommonBound`, but considers the rotation of the bounds.
 * @returns
 */
export function getCommonBoundWithRotation(bounds: IBound[]): Bound {
  if (bounds.length === 0) {
    return new Bound(0, 0, 0, 0);
  }

  return bounds.reduce(
    (pre, bound) => {
      return pre.unite(
        bound instanceof Bound ? bound : Bound.from(getBoundWithRotation(bound))
      );
    },
    Bound.from(getBoundWithRotation(bounds[0]))
  );
}

export function getBoundFromPoints(points: IVec[]) {
  return Bound.from(getIBoundFromPoints(points));
}

export function inflateBound(bound: IBound, delta: number) {
  const half = delta / 2;

  const newBound = new Bound(
    bound.x - half,
    bound.y - half,
    bound.w + delta,
    bound.h + delta
  );

  if (newBound.w <= 0 || newBound.h <= 0) {
    throw new Error('Invalid delta range or bound size.');
  }

  return newBound;
}

export function transformPointsToNewBound<T extends { x: number; y: number }>(
  points: T[],
  oldBound: IBound,
  oldMargin: number,
  newBound: IBound,
  newMargin: number
) {
  const wholeOldMargin = oldMargin * 2;
  const wholeNewMargin = newMargin * 2;
  const oldW = Math.max(oldBound.w - wholeOldMargin, 1);
  const oldH = Math.max(oldBound.h - wholeOldMargin, 1);
  const newW = Math.max(newBound.w - wholeNewMargin, 1);
  const newH = Math.max(newBound.h - wholeNewMargin, 1);

  const transformedPoints = points.map(p => {
    return {
      ...p,
      x: newW * ((p.x - oldMargin) / oldW) + newMargin,
      y: newH * ((p.y - oldMargin) / oldH) + newMargin,
    } as T;
  });

  return {
    points: transformedPoints,
    bound: new Bound(
      newBound.x,
      newBound.y,
      newW + wholeNewMargin,
      newH + wholeNewMargin
    ),
  };
}
