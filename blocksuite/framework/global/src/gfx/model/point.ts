import { clamp } from '../math.js';

export interface IPoint {
  x: number;
  y: number;
}

export class Point {
  x: number;

  y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Restrict a value to a certain interval.
   */
  static clamp(p: Point, min: Point, max: Point) {
    return new Point(clamp(p.x, min.x, max.x), clamp(p.y, min.y, max.y));
  }

  static from(point: IPoint | number[] | number, y?: number) {
    if (Array.isArray(point)) {
      return new Point(point[0], point[1]);
    }
    if (typeof point === 'number') {
      return new Point(point, y ?? point);
    }
    return new Point(point.x, point.y);
  }

  /**
   * Compares and returns the maximum of two points.
   */
  static max(a: Point, b: Point) {
    return new Point(Math.max(a.x, b.x), Math.max(a.y, b.y));
  }

  /**
   * Compares and returns the minimum of two points.
   */
  static min(a: Point, b: Point) {
    return new Point(Math.min(a.x, b.x), Math.min(a.y, b.y));
  }

  add(point: IPoint): Point {
    return new Point(this.x + point.x, this.y + point.y);
  }

  /**
   * Returns a copy of the point.
   */
  clone() {
    return new Point(this.x, this.y);
  }

  cross(point: IPoint): number {
    return this.x * point.y - this.y * point.x;
  }

  equals({ x, y }: Point) {
    return this.x === x && this.y === y;
  }

  lerp(point: IPoint, t: number): Point {
    return new Point(
      this.x + (point.x - this.x) * t,
      this.y + (point.y - this.y) * t
    );
  }

  scale(factor: number): Point {
    return new Point(this.x * factor, this.y * factor);
  }

  set(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  subtract(point: IPoint): Point {
    return new Point(this.x - point.x, this.y - point.y);
  }

  toArray() {
    return [this.x, this.y];
  }
}

export class Rect {
  // `[right, bottom]`
  max: Point;

  // `[left, top]`
  min: Point;

  get bottom() {
    return this.max.y;
  }

  set bottom(y: number) {
    this.max.y = y;
  }

  get height() {
    return this.max.y - this.min.y;
  }

  set height(h: number) {
    this.max.y = this.min.y + h;
  }

  get left() {
    return this.min.x;
  }

  set left(x: number) {
    this.min.x = x;
  }

  get right() {
    return this.max.x;
  }

  set right(x: number) {
    this.max.x = x;
  }

  get top() {
    return this.min.y;
  }

  set top(y: number) {
    this.min.y = y;
  }

  get width() {
    return this.max.x - this.min.x;
  }

  set width(w: number) {
    this.max.x = this.min.x + w;
  }

  constructor(left: number, top: number, right: number, bottom: number) {
    const [minX, maxX] = left <= right ? [left, right] : [right, left];
    const [minY, maxY] = top <= bottom ? [top, bottom] : [bottom, top];
    this.min = new Point(minX, minY);
    this.max = new Point(maxX, maxY);
  }

  static fromDOM(dom: Element) {
    return Rect.fromDOMRect(dom.getBoundingClientRect());
  }

  static fromDOMRect({ left, top, right, bottom }: DOMRect) {
    return Rect.fromLTRB(left, top, right, bottom);
  }

  static fromLTRB(left: number, top: number, right: number, bottom: number) {
    return new Rect(left, top, right, bottom);
  }

  static fromLWTH(left: number, width: number, top: number, height: number) {
    return new Rect(left, top, left + width, top + height);
  }

  static fromPoint(point: Point) {
    return Rect.fromPoints(point.clone(), point);
  }

  static fromPoints(start: Point, end: Point) {
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    const left = Math.min(end.x, start.x);
    const top = Math.min(end.y, start.y);
    return Rect.fromLWTH(left, width, top, height);
  }

  static fromXY(x: number, y: number) {
    return Rect.fromPoint(new Point(x, y));
  }

  center() {
    return new Point(
      (this.left + this.right) / 2,
      (this.top + this.bottom) / 2
    );
  }

  clamp(p: Point) {
    return Point.clamp(p, this.min, this.max);
  }

  clone() {
    const { left, top, right, bottom } = this;
    return new Rect(left, top, right, bottom);
  }

  contains({ min, max }: Rect) {
    return this.isPointIn(min) && this.isPointIn(max);
  }

  equals({ min, max }: Rect) {
    return this.min.equals(min) && this.max.equals(max);
  }

  extend_with(point: Point) {
    this.min = Point.min(this.min, point);
    this.max = Point.max(this.max, point);
  }

  extend_with_x(x: number) {
    this.min.x = Math.min(this.min.x, x);
    this.max.x = Math.max(this.max.x, x);
  }

  extend_with_y(y: number) {
    this.min.y = Math.min(this.min.y, y);
    this.max.y = Math.max(this.max.y, y);
  }

  intersect(other: Rect) {
    return Rect.fromPoints(
      Point.max(this.min, other.min),
      Point.min(this.max, other.max)
    );
  }

  intersects({ left, top, right, bottom }: Rect) {
    return (
      this.left <= right &&
      left <= this.right &&
      this.top <= bottom &&
      top <= this.bottom
    );
  }

  isPointDown({ x, y }: Point) {
    return this.bottom < y && this.left <= x && this.right >= x;
  }

  isPointIn({ x, y }: Point) {
    return (
      this.left <= x && x <= this.right && this.top <= y && y <= this.bottom
    );
  }

  isPointLeft({ x, y }: Point) {
    return x < this.left && this.top <= y && this.bottom >= y;
  }

  isPointRight({ x, y }: Point) {
    return x > this.right && this.top <= y && this.bottom >= y;
  }

  isPointUp({ x, y }: Point) {
    return y < this.top && this.left <= x && this.right >= x;
  }

  toDOMRect() {
    const { left, top, width, height } = this;
    return new DOMRect(left, top, width, height);
  }
}
