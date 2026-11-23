import type { Bound, IVec, IVec3 } from '@blocksuite/global/gfx';
import {
  almostEqual,
  isOverlap as _isOverlap,
  linePolygonIntersects,
} from '@blocksuite/global/gfx';

function isOverlap(line: IVec[], line2: IVec[]) {
  if (
    [line[0][1], line[1][1], line2[0][1], line2[1][1]].every(y =>
      almostEqual(y, line[0][1], 0.02)
    )
  ) {
    return _isOverlap(line, line2, 0);
  } else if (
    [line[0][0], line[1][0], line2[0][0], line2[1][0]].every(x =>
      almostEqual(x, line[0][0], 0.02)
    )
  ) {
    return _isOverlap(line, line2, 1);
  }
  return false;
}

function arrayAlmostEqual(point: IVec | IVec3, point2: IVec | IVec3) {
  return almostEqual(point[0], point2[0]) && almostEqual(point[1], point2[1]);
}

export class Graph<V extends IVec | IVec3 = IVec> {
  private readonly _xMap = new Map<number, V[]>();

  private readonly _yMap = new Map<number, V[]>();

  constructor(
    private readonly points: V[],
    private readonly blocks: Bound[] = [],
    private readonly expandedBlocks: Bound[] = [],
    private readonly excludedPoints: V[] = []
  ) {
    const xMap = this._xMap;
    const yMap = this._yMap;
    this.points.forEach(point => {
      const [x, y] = point;
      if (!xMap.has(x)) xMap.set(x, []);
      if (!yMap.has(y)) yMap.set(y, []);
      xMap.get(x)?.push(point);
      yMap.get(y)?.push(point);
    });
  }

  private _canSkipBlock(point: IVec | IVec3) {
    return this.excludedPoints.some(excludedPoint => {
      return arrayAlmostEqual(point, excludedPoint);
    });
  }

  private _isBlock(sp: IVec | IVec3, ep: IVec | IVec3) {
    return (
      this.blocks.some(block => {
        const rst = linePolygonIntersects(sp as IVec, ep as IVec, block.points);
        return (
          rst?.length === 2 ||
          block.isPointInBound(sp as IVec, 0) ||
          block.isPointInBound(ep as IVec, 0) ||
          [
            block.leftLine,
            block.upperLine,
            block.rightLine,
            block.lowerLine,
          ].some(line => {
            return isOverlap(line, [sp, ep] as IVec[]);
          })
        );
      }) ||
      this.expandedBlocks.some(block => {
        const result = linePolygonIntersects(
          sp as IVec,
          ep as IVec,
          block.expand(-0.5).points
        );
        return result?.length === 2;
      })
    );
  }

  neighbors(curPoint: V): V[] {
    const [x, y] = curPoint;
    const neighbors = new Set<V>();
    const xPoints = this._xMap.get(x);
    const yPoints = this._yMap.get(y);
    if (xPoints) {
      let plusMin = Infinity;
      let minusMin = Infinity;
      let plusPoint: V | undefined;
      let minusPoint: V | undefined;
      xPoints.forEach(point => {
        if (arrayAlmostEqual(point, curPoint as unknown as IVec)) return;
        const dif = point[1] - curPoint[1];
        if (dif > 0 && dif < plusMin) {
          plusMin = dif;
          plusPoint = point;
        }
        if (dif < 0 && Math.abs(dif) < minusMin) {
          minusMin = Math.abs(dif);
          minusPoint = point;
        }
      });
      if (
        plusPoint &&
        (this._canSkipBlock(plusPoint) || !this._isBlock(curPoint, plusPoint))
      ) {
        neighbors.add(plusPoint);
      }
      if (
        minusPoint &&
        (this._canSkipBlock(minusPoint) || !this._isBlock(curPoint, minusPoint))
      )
        neighbors.add(minusPoint);
    }
    if (yPoints) {
      let plusMin = Infinity;
      let minusMin = Infinity;
      let plusPoint: V | undefined;
      let minusPoint: V | undefined;
      yPoints.forEach(point => {
        if (arrayAlmostEqual(point, curPoint)) return;
        const dif = point[0] - curPoint[0];
        if (dif > 0 && dif < plusMin) {
          plusMin = dif;
          plusPoint = point;
        }
        if (dif < 0 && Math.abs(dif) < minusMin) {
          minusMin = Math.abs(dif);
          minusPoint = point;
        }
      });
      if (
        plusPoint &&
        (this._canSkipBlock(plusPoint) || !this._isBlock(curPoint, plusPoint))
      )
        neighbors.add(plusPoint);
      if (
        minusPoint &&
        (this._canSkipBlock(minusPoint) || !this._isBlock(curPoint, minusPoint))
      )
        neighbors.add(minusPoint);
    }

    return Array.from(neighbors);
  }
}
