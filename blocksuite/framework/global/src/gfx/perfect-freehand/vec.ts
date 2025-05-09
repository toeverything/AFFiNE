import type { IVec } from '../model/index.js';

/**
 * Negate a vector.
 * @param A
 * @internal
 */
export function neg(A: IVec): IVec {
  return [-A[0], -A[1]];
}

/**
 * Add vectors.
 * @param A
 * @param B
 * @internal
 */
export function add(A: IVec, B: IVec): IVec {
  return [A[0] + B[0], A[1] + B[1]];
}

/**
 * Subtract vectors.
 * @param A
 * @param B
 * @internal
 */
export function sub(A: IVec, B: IVec): IVec {
  return [A[0] - B[0], A[1] - B[1]];
}

/**
 * Vector multiplication by scalar
 * @param A
 * @param n
 * @internal
 */
export function mul(A: IVec, n: number): IVec {
  return [A[0] * n, A[1] * n];
}

/**
 * Vector division by scalar.
 * @param A
 * @param n
 * @internal
 */
export function div(A: IVec, n: number): IVec {
  return [A[0] / n, A[1] / n];
}

/**
 * Perpendicular rotation of a vector A
 * @param A
 * @internal
 */
export function per(A: IVec): IVec {
  return [A[1], -A[0]];
}

/**
 * Dot product
 * @param A
 * @param B
 * @internal
 */
export function dpr(A: IVec, B: IVec) {
  return A[0] * B[0] + A[1] * B[1];
}

/**
 * Get whether two vectors are equal.
 * @param A
 * @param B
 * @internal
 */
export function isEqual(A: IVec, B: IVec) {
  return A[0] === B[0] && A[1] === B[1];
}

/**
 * Length of the vector
 * @param A
 * @internal
 */
export function len(A: IVec) {
  return Math.hypot(A[0], A[1]);
}

/**
 * Length of the vector squared
 * @param A
 * @internal
 */
export function len2(A: IVec) {
  return A[0] * A[0] + A[1] * A[1];
}

/**
 * Dist length from A to B squared.
 * @param A
 * @param B
 * @internal
 */
export function dist2(A: IVec, B: IVec) {
  return len2(sub(A, B));
}

/**
 * Get normalized / unit vector.
 * @param A
 * @internal
 */
export function uni(A: IVec) {
  return div(A, len(A));
}

/**
 * Dist length from A to B
 * @param A
 * @param B
 * @internal
 */
export function dist(A: IVec, B: IVec) {
  return Math.hypot(A[1] - B[1], A[0] - B[0]);
}

/**
 * Mean between two vectors or mid vector between two vectors
 * @param A
 * @param B
 * @internal
 */
export function med(A: IVec, B: IVec) {
  return mul(add(A, B), 0.5);
}

/**
 * Rotate a vector around another vector by r (radians)
 * @param A vector
 * @param C center
 * @param r rotation in radians
 * @internal
 */
export function rotAround(A: IVec, C: IVec, r: number): IVec {
  const s = Math.sin(r);
  const c = Math.cos(r);

  const px = A[0] - C[0];
  const py = A[1] - C[1];

  const nx = px * c - py * s;
  const ny = px * s + py * c;

  return [nx + C[0], ny + C[1]];
}

/**
 * Interpolate vector A to B with a scalar t
 * @param A
 * @param B
 * @param t scalar
 * @internal
 */
export function lrp(A: IVec, B: IVec, t: number) {
  return add(A, mul(sub(B, A), t));
}

/**
 * Project a point A in the direction B by a scalar c
 * @param A
 * @param B
 * @param c
 * @internal
 */
export function prj(A: IVec, B: IVec, c: number) {
  return add(A, mul(B, c));
}
