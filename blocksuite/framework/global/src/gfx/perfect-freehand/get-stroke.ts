import type { IVec, IVec3 } from '../model/index.js';
import { getStrokeOutlinePoints } from './get-stroke-outline-points.js';
import { getStrokePoints } from './get-stroke-points.js';
import type { StrokeOptions } from './types.js';

/**
 * ## getStroke
 * @description Get an array of points describing a polygon that surrounds the input points.
 * @param points An array of points (as `[x, y, pressure]` or `{x, y, pressure}`). Pressure is optional in both cases.
 * @param options (optional) An object with options.
 * @param options.size	The base size (diameter) of the stroke.
 * @param options.thinning The effect of pressure on the stroke's size.
 * @param options.smoothing	How much to soften the stroke's edges.
 * @param options.easing	An easing function to apply to each point's pressure.
 * @param options.simulatePressure Whether to simulate pressure based on velocity.
 * @param options.start Cap, taper and easing for the start of the line.
 * @param options.end Cap, taper and easing for the end of the line.
 * @param options.last Whether to handle the points as a completed stroke.
 */

export function getStroke(
  points: (IVec | IVec3 | { x: number; y: number; pressure?: number })[],
  options: StrokeOptions = {} as StrokeOptions
) {
  return getStrokeOutlinePoints(getStrokePoints(points, options), options);
}
