import type { IBound, IVec } from '@blocksuite/global/gfx';
import {
  Bound,
  getCenterAreaBounds,
  getPointsFromBoundWithRotation,
  linePolygonIntersects,
  pointInPolygon,
  PointLocation,
  pointOnPolygonStoke,
  polygonGetPointTangent,
  polygonNearestPoint,
  rotatePoints,
} from '@blocksuite/global/gfx';
import type { PointTestOptions } from '@blocksuite/std/gfx';

import { DEFAULT_CENTRAL_AREA_RATIO } from '../../../consts/index.js';
import type { ShapeElementModel } from '../shape.js';

export function createPolygonShape(pointsFn: (bound: IBound) => IVec[]) {
  return {
    points: pointsFn,
    draw(ctx: CanvasRenderingContext2D, { x, y, w, h, rotate = 0 }: IBound) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const points = pointsFn({ x, y, w, h, rotate });

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.translate(-cx, -cy);

      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.closePath();

      ctx.restore();
    },
    includesPoint(
      this: ShapeElementModel,
      x: number,
      y: number,
      options: PointTestOptions
    ) {
      const point: IVec = [x, y];
      const points = getPointsFromBoundWithRotation(this, pointsFn);

      let hit = pointOnPolygonStoke(
        point,
        points,
        (options?.hitThreshold ?? 1) / (options.zoom ?? 1)
      );

      if (!hit) {
        if (!options.ignoreTransparent || this.filled) {
          hit = pointInPolygon([x, y], points);
        } else {
          const text = this.text;
          if (!text || !text.length) {
            const centralBounds = getCenterAreaBounds(
              this,
              DEFAULT_CENTRAL_AREA_RATIO
            );
            const centralPoints = getPointsFromBoundWithRotation(
              centralBounds,
              pointsFn
            );
            hit = pointInPolygon(point, centralPoints);
          } else if (this.textBound) {
            hit = pointInPolygon(
              point,
              getPointsFromBoundWithRotation(
                this,
                () => Bound.from(this.textBound!).points
              )
            );
          }
        }
      }

      return hit;
    },
    containsBound(bounds: Bound, element: ShapeElementModel) {
      const points = getPointsFromBoundWithRotation(element, pointsFn);
      return points.some(point => bounds.containsPoint(point));
    },
    getNearestPoint(point: IVec, element: ShapeElementModel) {
      const points = getPointsFromBoundWithRotation(element, pointsFn);
      return polygonNearestPoint(points, point);
    },
    getLineIntersections(start: IVec, end: IVec, element: ShapeElementModel) {
      const points = getPointsFromBoundWithRotation(element, pointsFn);
      return linePolygonIntersects(start, end, points);
    },
    getRelativePointLocation(position: IVec, element: ShapeElementModel) {
      const bound = Bound.deserialize(element.xywh);
      const point = bound.getRelativePoint(position);
      let points = pointsFn(bound);
      points.push(point);

      points = rotatePoints(points, bound.center, element.rotate);
      const rotatePoint = points.pop() as IVec;
      const tangent = polygonGetPointTangent(points, rotatePoint);
      return new PointLocation(rotatePoint, tangent);
    },
  };
}
