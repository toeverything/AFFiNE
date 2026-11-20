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

export function createCustomShape(
  pointsFn: (bound: IBound) => IVec[],
  drawFn: (ctx: CanvasRenderingContext2D, bound: IBound) => void
) {
  return {
    points: pointsFn,
    draw(ctx: CanvasRenderingContext2D, { x, y, w, h, rotate = 0 }: IBound) {
      const cx = x + w / 2;
      const cy = y + h / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.translate(-cx, -cy);

      drawFn(ctx, { x, y, w, h, rotate });

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
