import { type IVec, Vec } from './vec.js';

/**
 * PointLocation is an implementation of IVec with in/out vectors and tangent.
 * This is useful when dealing with path.
 */
export class PointLocation extends Array<number> implements IVec {
  _in: IVec = [0, 0];

  _out: IVec = [0, 0];

  // the tangent belongs to the point on the element outline
  _tangent: IVec = [0, 0];

  [0]: number;

  [1]: number;

  get absIn() {
    return Vec.add(this, this._in);
  }

  get absOut() {
    return Vec.add(this, this._out);
  }

  get in() {
    return this._in;
  }

  set in(value: IVec) {
    this._in = value;
  }

  override get length() {
    return super.length as 2;
  }

  get out() {
    return this._out;
  }

  set out(value: IVec) {
    this._out = value;
  }

  get tangent() {
    return this._tangent;
  }

  set tangent(value: IVec) {
    this._tangent = value;
  }

  constructor(
    point: IVec = [0, 0],
    tangent: IVec = [0, 0],
    inVec: IVec = [0, 0],
    outVec: IVec = [0, 0]
  ) {
    super(2);
    this[0] = point[0];
    this[1] = point[1];
    this._tangent = tangent;
    this._in = inVec;
    this._out = outVec;
  }

  static fromVec(vec: IVec) {
    const point = new PointLocation();
    point[0] = vec[0];
    point[1] = vec[1];
    return point;
  }

  clone() {
    return new PointLocation(
      this as unknown as IVec,
      this._tangent,
      this._in,
      this._out
    );
  }

  setVec(vec: IVec) {
    this[0] = vec[0];
    this[1] = vec[1];
    return this;
  }

  toVec(): IVec {
    return [this[0], this[1]];
  }
}
