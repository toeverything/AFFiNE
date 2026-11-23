import {
  Bound,
  clamp,
  getPointsFromBoundWithRotation,
  type IBound,
  type IVec,
  lineEllipseIntersects,
  pointInEllipse,
  pointInPolygon,
  PointLocation,
  rotatePoints,
  toRadian,
  Vec,
} from '@blocksuite/global/gfx';
import type { PointTestOptions } from '@blocksuite/std/gfx';

import { DEFAULT_CENTRAL_AREA_RATIO } from '../../../consts/index.js';
import type { ShapeElementModel } from '../shape.js';

export const ellipse = {
  points({ x, y, w, h }: IBound): IVec[] {
    return [
      [x, y + h / 2],
      [x + w / 2, y],
      [x + w, y + h / 2],
      [x + w / 2, y + h],
    ];
  },
  draw(ctx: CanvasRenderingContext2D, { x, y, w, h, rotate = 0 }: IBound) {
    const cx = x + w / 2;
    const cy = y + h / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.translate(-cx, -cy);

    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, 2 * Math.PI);

    ctx.restore();
  },
  includesPoint(
    this: ShapeElementModel,
    x: number,
    y: number,
    options: PointTestOptions
  ) {
    const point: IVec = [x, y];
    const expand = (options?.hitThreshold ?? 1) / (options?.zoom ?? 1);
    const rx = this.w / 2;
    const ry = this.h / 2;
    const center: IVec = [this.x + rx, this.y + ry];
    const rad = (this.rotate * Math.PI) / 180;

    let hit =
      pointInEllipse(point, center, rx + expand, ry + expand, rad) &&
      !pointInEllipse(point, center, rx - expand, ry - expand, rad);

    if (!hit) {
      if (!options.ignoreTransparent || this.filled) {
        hit = pointInEllipse(point, center, rx, ry, rad);
      } else {
        // If shape is not filled or transparent
        const text = this.text;
        if (!text || !text.length) {
          // Check the center area of the shape
          const centralRx = rx * DEFAULT_CENTRAL_AREA_RATIO;
          const centralRy = ry * DEFAULT_CENTRAL_AREA_RATIO;
          hit = pointInEllipse(point, center, centralRx, centralRy, rad);
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
    const points = getPointsFromBoundWithRotation(element, ellipse.points);
    return points.some(point => bounds.containsPoint(point));
  },

  // See links:
  // * https://github.com/0xfaded/ellipse_demo/issues/1
  // * https://blog.chatfield.io/simple-method-for-distance-to-ellipse/
  // * https://gist.github.com/fundon/11331322d3ca223c42e216df48c339e1
  // * https://github.com/excalidraw/excalidraw/blob/master/packages/utils/geometry/geometry.ts#L888 (MIT)
  getNearestPoint(point: IVec, { rotate, xywh }: ShapeElementModel) {
    const { center, w, h } = Bound.deserialize(xywh);
    const rad = toRadian(rotate);
    const a = w / 2;
    const b = h / 2;

    // Use the center of the ellipse as the origin
    const [rotatedPointX, rotatedPointY] = Vec.rot(
      Vec.sub(point, center),
      -rad
    );

    const px = Math.abs(rotatedPointX);
    const py = Math.abs(rotatedPointY);

    let tx = Math.SQRT1_2; // 0.707
    let ty = Math.SQRT1_2; // 0.707
    let i = 0;

    for (; i < 3; i++) {
      const x = a * tx;
      const y = b * ty;

      const ex = ((a * a - b * b) * tx ** 3) / a;
      const ey = ((b * b - a * a) * ty ** 3) / b;

      const rx = x - ex;
      const ry = y - ey;

      const qx = px - ex;
      const qy = py - ey;

      const r = Math.hypot(ry, rx);
      const q = Math.hypot(qy, qx);

      tx = clamp(((qx * r) / q + ex) / a, 0, 1);
      ty = clamp(((qy * r) / q + ey) / b, 0, 1);
      const t = Math.hypot(ty, tx);
      tx /= t;
      ty /= t;
    }

    return Vec.add(
      Vec.rot(
        [a * tx * Math.sign(rotatedPointX), b * ty * Math.sign(rotatedPointY)],
        rad
      ),
      center
    );
  },

  getLineIntersections(
    start: IVec,
    end: IVec,
    { rotate, xywh }: ShapeElementModel
  ) {
    const rad = toRadian(rotate);
    const bound = Bound.deserialize(xywh);
    return lineEllipseIntersects(
      start,
      end,
      bound.center,
      bound.w / 2,
      bound.h / 2,
      rad
    );
  },

  getRelativePointLocation(
    relativePoint: IVec,
    { rotate, xywh }: ShapeElementModel
  ) {
    const bounds = Bound.deserialize(xywh);
    const point = bounds.getRelativePoint(relativePoint);
    const { x, y, w, h, center } = bounds;
    const points = rotatePoints(
      [
        [x, y],
        [x + w / 2, y],
        [x + w, y],
        [x + w, y + h / 2],
        [x + w, y + h],
        [x + w / 2, y + h],
        [x, y + h],
        [x, y + h / 2],
        point,
      ],
      center,
      rotate
    );
    const rotatedPoint = points.pop() as IVec;
    const len = points.length;
    let tangent: IVec = [0, 0.5];
    let i = 0;

    for (; i < len; i++) {
      const p0 = points[i];
      const p1 = points[(i + 1) % len];
      const bounds = Bound.fromPoints([p0, p1, center]);
      if (bounds.containsPoint(rotatedPoint)) {
        tangent = Vec.normalize(Vec.sub(p1, p0));
        break;
      }
    }

    return new PointLocation(rotatedPoint, tangent);
  },
};
