import {
  Bound,
  getBoundFromPoints,
  getPointsFromBoundWithRotation,
  getQuadBoundWithRotation,
  getSolidStrokePoints,
  getSvgPathFromStroke,
  inflateBound,
  isPointOnlines,
  type IVec,
  type IVec3,
  lineIntersects,
  PointLocation,
  polyLineNearestPoint,
  type SerializedXYWH,
  transformPointsToNewBound,
  Vec,
} from '@blocksuite/global/gfx';
import type { BaseElementProps, PointTestOptions } from '@blocksuite/std/gfx';
import {
  convert,
  derive,
  field,
  GfxPrimitiveElementModel,
  watch,
} from '@blocksuite/std/gfx';

import { DEFAULT_HIGHLIGHTER_LINE_WIDTH } from '../../consts';
import { type Color, DefaultTheme } from '../../themes/index';

export type HighlighterProps = BaseElementProps & {
  /**
   * [[x0,y0,pressure0?],[x1,y1,pressure1?]...]
   * pressure is optional and exsits when pressure sensitivity is supported, otherwise not.
   */
  points: number[][];
  color: Color;
  lineWidth: number;
};

export class HighlighterElementModel extends GfxPrimitiveElementModel<HighlighterProps> {
  /**
   * The SVG path commands for the brush.
   */
  get commands() {
    if (!this._local.has('commands')) {
      const stroke = getSolidStrokePoints(this.points ?? [], this.lineWidth);
      const commands = getSvgPathFromStroke(stroke);

      this._local.set('commands', commands);
    }

    return this._local.get('commands') as string;
  }

  override get connectable() {
    return false;
  }

  override get type() {
    return 'highlighter';
  }

  override containsBound(bounds: Bound) {
    const points = getPointsFromBoundWithRotation(this);
    return points.some(point => bounds.containsPoint(point));
  }

  override getLineIntersections(start: IVec, end: IVec) {
    const tl = [this.x, this.y];
    const points = getPointsFromBoundWithRotation(this, _ =>
      this.points.map(point => Vec.add(point, tl))
    );

    const box = Bound.fromDOMRect(getQuadBoundWithRotation(this));

    if (box.w < 8 && box.h < 8) {
      return Vec.distanceToLineSegment(start, end, box.center) < 5 ? [] : null;
    }

    if (box.intersectLine(start, end, true)) {
      const len = points.length;
      for (let i = 1; i < len; i++) {
        const result = lineIntersects(start, end, points[i - 1], points[i]);
        if (result) {
          return [
            new PointLocation(
              result,
              Vec.normalize(Vec.sub(points[i], points[i - 1]))
            ),
          ];
        }
      }
    }
    return null;
  }

  override getNearestPoint(point: IVec): IVec {
    const { x, y } = this;

    return polyLineNearestPoint(
      this.points.map(p => Vec.add(p, [x, y])),
      point
    ) as IVec;
  }

  override getRelativePointLocation(position: IVec): PointLocation {
    const point = Bound.deserialize(this.xywh).getRelativePoint(position);
    return new PointLocation(point);
  }

  override includesPoint(
    px: number,
    py: number,
    options?: PointTestOptions
  ): boolean {
    const hit = isPointOnlines(
      Bound.deserialize(this.xywh),
      this.points as [number, number][],
      this.rotate,
      [px, py],
      (options?.hitThreshold ?? 10) / Math.min(options?.zoom ?? 1, 1)
    );
    return hit;
  }

  @field()
  accessor color: Color = DefaultTheme.hightlighterColor;

  @watch((_, instance) => {
    instance['_local'].delete('commands');
  })
  @derive((lineWidth: number, instance: Instance) => {
    const oldBound = Bound.fromXYWH(instance.deserializedXYWH);

    if (
      lineWidth === instance.lineWidth ||
      oldBound.w === 0 ||
      oldBound.h === 0
    )
      return {};

    const points = instance.points;
    const transformed = transformPointsToNewBound(
      points.map(([x, y]) => ({ x, y })),
      oldBound,
      instance.lineWidth / 2,
      inflateBound(oldBound, lineWidth - instance.lineWidth),
      lineWidth / 2
    );

    return {
      points: transformed.points.map((p, i) => [
        p.x,
        p.y,
        ...(points[i][2] !== undefined ? [points[i][2]] : []),
      ]),
      xywh: transformed.bound.serialize(),
    };
  })
  @field()
  accessor lineWidth: number = DEFAULT_HIGHLIGHTER_LINE_WIDTH;

  @watch((_, instance) => {
    instance['_local'].delete('commands');
  })
  @derive((points: IVec[], instance: Instance) => {
    const lineWidth = instance.lineWidth;
    const bound = getBoundFromPoints(points);
    const boundWidthLineWidth = inflateBound(bound, lineWidth);

    return {
      xywh: boundWidthLineWidth.serialize(),
    };
  })
  @convert((points: (IVec | IVec3)[], instance) => {
    const lineWidth = instance.lineWidth;
    const bound = getBoundFromPoints(points as IVec[]);
    const boundWidthLineWidth = inflateBound(bound, lineWidth);
    const relativePoints = points.map(([x, y, pressure]) => [
      x - boundWidthLineWidth.x,
      y - boundWidthLineWidth.y,
      ...(pressure !== undefined ? [pressure] : []),
    ]);

    return relativePoints;
  })
  @field()
  accessor points: (IVec | IVec3)[] = [];

  @field(0)
  accessor rotate: number = 0;

  @derive((xywh: SerializedXYWH, instance: Instance) => {
    const bound = Bound.deserialize(xywh);

    if (bound.w === instance.w && bound.h === instance.h) return {};

    const { lineWidth } = instance;
    const transformed = transformPointsToNewBound(
      instance.points.map(([x, y]) => ({ x, y })),
      instance,
      instance.lineWidth / 2,
      bound,
      lineWidth / 2
    );

    return {
      points: transformed.points.map((p, i) => [
        p.x,
        p.y,
        ...(instance.points[i][2] !== undefined ? [instance.points[i][2]] : []),
      ]),
    };
  })
  @field()
  accessor xywh: SerializedXYWH = '[0,0,0,0]';
}

type Instance = GfxPrimitiveElementModel<HighlighterProps> & HighlighterProps;
