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

export const rect = {
  points({ x, y, w, h }: IBound) {
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  },
  draw(ctx: CanvasRenderingContext2D, { x, y, w, h, rotate = 0 }: IBound) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.translate(-x - w / 2, -y - h / 2);
    ctx.rect(x, y, w, h);
    ctx.restore();
  },
  includesPoint(
    this: ShapeElementModel,
    x: number,
    y: number,
    options: PointTestOptions
  ) {
    const point: IVec = [x, y];
    const points = getPointsFromBoundWithRotation(
      this,
      undefined,
      options.responsePadding
    );

    let hit = pointOnPolygonStoke(
      point,
      points,
      (options?.hitThreshold ?? 1) / (options.zoom ?? 1)
    );

    if (!hit) {
      // If the point is not on the stroke, check if it is in the shape
      // When the shape is filled and transparent is not ignored
      if (!options.ignoreTransparent || this.filled) {
        hit = pointInPolygon([x, y], points);
      } else {
        // If shape is not filled or transparent
        // Check if hit the text area
        const text = this.text;
        if (!text || !text.length) {
          // if not, check the default center area of the shape
          const centralBounds = getCenterAreaBounds(
            this,
            DEFAULT_CENTRAL_AREA_RATIO
          );
          const centralPoints = getPointsFromBoundWithRotation(centralBounds);
          // Check if the point is in the center area
          hit = pointInPolygon([x, y], centralPoints);
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

  containsBound(bounds: Bound, element: ShapeElementModel): boolean {
    const points = getPointsFromBoundWithRotation(element);
    return points.some(point => bounds.containsPoint(point));
  },

  getNearestPoint(point: IVec, element: ShapeElementModel) {
    const points = getPointsFromBoundWithRotation(element);
    return polygonNearestPoint(points, point);
  },

  getLineIntersections(start: IVec, end: IVec, element: ShapeElementModel) {
    const points = getPointsFromBoundWithRotation(element);
    return linePolygonIntersects(start, end, points);
  },

  getRelativePointLocation(relativePoint: IVec, element: ShapeElementModel) {
    const bound = Bound.deserialize(element.xywh);
    const point = bound.getRelativePoint(relativePoint);
    const rotatePoint = rotatePoints(
      [point],
      bound.center,
      element.rotate ?? 0
    )[0];
    const points = rotatePoints(
      bound.points,
      bound.center,
      element.rotate ?? 0
    );
    const tangent = polygonGetPointTangent(points, rotatePoint);
    return new PointLocation(rotatePoint, tangent);
  },
};
