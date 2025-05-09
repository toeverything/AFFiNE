import { EPSILON, lineIntersects, polygonPointDistance } from '../math.js';
import type { SerializedXYWH, XYWH } from '../xywh.js';
import { deserializeXYWH, serializeXYWH } from '../xywh.js';
import { type IVec, Vec } from './vec.js';

export function getIBoundFromPoints(
  points: IVec[],
  rotation = 0
): IBound & {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  if (points.length < 1) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  } else {
    for (const [x, y] of points) {
      minX = Math.min(x, minX);
      minY = Math.min(y, minY);
      maxX = Math.max(x, maxX);
      maxY = Math.max(y, maxY);
    }
  }

  if (rotation !== 0) {
    return getIBoundFromPoints(
      points.map(pt =>
        Vec.rotWith(pt, [(minX + maxX) / 2, (minY + maxY) / 2], rotation)
      )
    );
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

/**
 * Represents the x, y, width, and height of a block that can be easily accessed.
 */
export interface IBound {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
}

export class Bound implements IBound {
  h: number;

  w: number;

  x: number;

  y: number;

  get bl(): IVec {
    return [this.x, this.y + this.h];
  }

  get br(): IVec {
    return [this.x + this.w, this.y + this.h];
  }

  get center(): IVec {
    return [this.x + this.w / 2, this.y + this.h / 2];
  }

  set center([cx, cy]: IVec) {
    const [px, py] = this.center;
    this.x += cx - px;
    this.y += cy - py;
  }

  get horizontalLine(): IVec[] {
    return [
      [this.x, this.y + this.h / 2],
      [this.x + this.w, this.y + this.h / 2],
    ];
  }

  get leftLine(): IVec[] {
    return [
      [this.x, this.y],
      [this.x, this.y + this.h],
    ];
  }

  get lowerLine(): IVec[] {
    return [
      [this.x, this.y + this.h],
      [this.x + this.w, this.y + this.h],
    ];
  }

  get maxX() {
    return this.x + this.w;
  }

  get maxY() {
    return this.y + this.h;
  }

  get midPoints(): IVec[] {
    return [
      [this.x + this.w / 2, this.y],
      [this.x + this.w, this.y + this.h / 2],
      [this.x + this.w / 2, this.y + this.h],
      [this.x, this.y + this.h / 2],
    ];
  }

  get minX() {
    return this.x;
  }

  get minY() {
    return this.y;
  }

  get points(): IVec[] {
    return [
      [this.x, this.y],
      [this.x + this.w, this.y],
      [this.x + this.w, this.y + this.h],
      [this.x, this.y + this.h],
    ];
  }

  get rightLine(): IVec[] {
    return [
      [this.x + this.w, this.y],
      [this.x + this.w, this.y + this.h],
    ];
  }

  get tl(): IVec {
    return [this.x, this.y];
  }

  get tr(): IVec {
    return [this.x + this.w, this.y];
  }

  get upperLine(): IVec[] {
    return [
      [this.x, this.y],
      [this.x + this.w, this.y],
    ];
  }

  get verticalLine(): IVec[] {
    return [
      [this.x + this.w / 2, this.y],
      [this.x + this.w / 2, this.y + this.h],
    ];
  }

  constructor(x = 0, y = 0, w = 0, h = 0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  static deserialize(s: string) {
    const [x, y, w, h] = deserializeXYWH(s);
    return new Bound(x, y, w, h);
  }

  static from(arg1: IBound) {
    return new Bound(arg1.x, arg1.y, arg1.w, arg1.h);
  }

  static fromCenter(center: IVec, width: number, height: number) {
    const [x, y] = center;
    return new Bound(x - width / 2, y - height / 2, width, height);
  }

  static fromDOMRect({ left, top, width, height }: DOMRect) {
    return new Bound(left, top, width, height);
  }

  static fromPoints(points: IVec[]) {
    return Bound.from(getIBoundFromPoints(points));
  }

  static fromXYWH(xywh: XYWH) {
    return new Bound(xywh[0], xywh[1], xywh[2], xywh[3]);
  }

  static serialize(bound: IBound) {
    return serializeXYWH(bound.x, bound.y, bound.w, bound.h);
  }

  clone(): Bound {
    return new Bound(this.x, this.y, this.w, this.h);
  }

  contains(bound: Bound) {
    return (
      bound.x >= this.x &&
      bound.y >= this.y &&
      bound.maxX <= this.maxX &&
      bound.maxY <= this.maxY
    );
  }

  containsPoint([x, y]: IVec): boolean {
    const { minX, minY, maxX, maxY } = this;
    return minX <= x && x <= maxX && minY <= y && y <= maxY;
  }

  expand(margin: [number, number]): Bound;
  expand(left: number, top?: number, right?: number, bottom?: number): Bound;
  expand(
    left: number | [number, number],
    top?: number,
    right?: number,
    bottom?: number
  ) {
    if (Array.isArray(left)) {
      const [x, y] = left;
      return new Bound(this.x - x, this.y - y, this.w + x * 2, this.h + y * 2);
    }

    top ??= left;
    right ??= left;
    bottom ??= top;

    return new Bound(
      this.x - left,
      this.y - top,
      this.w + left + right,
      this.h + top + bottom
    );
  }

  getRelativePoint([x, y]: IVec): IVec {
    return [this.x + x * this.w, this.y + y * this.h];
  }

  getVerticesAndMidpoints() {
    return [...this.points, ...this.midPoints];
  }

  horizontalDistance(bound: Bound) {
    return Math.min(
      Math.abs(this.minX - bound.maxX),
      Math.abs(this.maxX - bound.minX)
    );
  }

  include(point: IVec) {
    const x1 = Math.min(this.x, point[0]),
      y1 = Math.min(this.y, point[1]),
      x2 = Math.max(this.maxX, point[0]),
      y2 = Math.max(this.maxY, point[1]);
    return new Bound(x1, y1, x2 - x1, y2 - y1);
  }

  intersectLine(sp: IVec, ep: IVec, infinite = false) {
    const rst: IVec[] = [];
    (
      [
        [this.tl, this.tr],
        [this.tl, this.bl],
        [this.tr, this.br],
        [this.bl, this.br],
      ] as IVec[][]
    ).forEach(([p1, p2]) => {
      const p = lineIntersects(sp, ep, p1, p2, infinite);
      if (p) rst.push(p);
    });
    return rst.length === 0 ? null : rst;
  }

  isHorizontalCross(bound: Bound) {
    return !(this.maxY < bound.minY || this.minY > bound.maxY);
  }

  isIntersectWithBound(bound: Bound, epsilon = EPSILON) {
    return (
      bound.maxX > this.minX - epsilon &&
      bound.maxY > this.minY - epsilon &&
      bound.minX < this.maxX + epsilon &&
      bound.minY < this.maxY + epsilon &&
      !this.contains(bound) &&
      !bound.contains(this)
    );
  }

  isOverlapWithBound(bound: Bound, epsilon = EPSILON) {
    return (
      bound.maxX > this.minX - epsilon &&
      bound.maxY > this.minY - epsilon &&
      bound.minX < this.maxX + epsilon &&
      bound.minY < this.maxY + epsilon
    );
  }

  isPointInBound([x, y]: IVec, tolerance = 0.01) {
    return (
      x > this.minX + tolerance &&
      x < this.maxX - tolerance &&
      y > this.minY + tolerance &&
      y < this.maxY - tolerance
    );
  }

  isPointNearBound([x, y]: IVec, tolerance = 0.01) {
    return polygonPointDistance(this.points, [x, y]) < tolerance;
  }

  isVerticalCross(bound: Bound) {
    return !(this.maxX < bound.minX || this.minX > bound.maxX);
  }

  moveDelta(dx: number, dy: number) {
    return new Bound(this.x + dx, this.y + dy, this.w, this.h);
  }

  serialize(): SerializedXYWH {
    return serializeXYWH(this.x, this.y, this.w, this.h);
  }

  /**
   * Convert a point to relative coordinates.
   * @param point - The point to convert.
   * @returns The normalized relative coordinates of the point.
   */
  toRelative([x, y]: IVec): IVec {
    const normalizedX = this.w === 0 ? 0 : (x - this.x) / this.w;
    const normalizedY = this.h === 0 ? 0 : (y - this.y) / this.h;
    return [normalizedX, normalizedY];
  }

  toXYWH(): XYWH {
    return [this.x, this.y, this.w, this.h];
  }

  unite(bound: Bound) {
    const x1 = Math.min(this.x, bound.x),
      y1 = Math.min(this.y, bound.y),
      x2 = Math.max(this.maxX, bound.maxX),
      y2 = Math.max(this.maxY, bound.maxY);
    return new Bound(x1, y1, x2 - x1, y2 - y1);
  }

  verticalDistance(bound: Bound) {
    return Math.min(
      Math.abs(this.minY - bound.maxY),
      Math.abs(this.maxY - bound.minY)
    );
  }
}
