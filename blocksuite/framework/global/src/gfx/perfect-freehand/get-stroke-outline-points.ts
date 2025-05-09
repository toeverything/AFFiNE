import type { IVec } from '../model/index.js';
import { getStrokeRadius } from './get-stroke-radius.js';
import type { StrokeOptions, StrokePoint } from './types.js';
import {
  add,
  dist2,
  dpr,
  lrp,
  mul,
  neg,
  per,
  prj,
  rotAround,
  sub,
  uni,
} from './vec.js';

const { min, PI } = Math;

// This is the rate of change for simulated pressure. It could be an option.
const RATE_OF_PRESSURE_CHANGE = 0.275;

// Browser strokes seem to be off if PI is regular, a tiny offset seems to fix it
const FIXED_PI = PI + 0.0001;

/**
 * ## getStrokeOutlinePoints
 * @description Get an array of points (as `[x, y]`) representing the outline of a stroke.
 * @param points An array of StrokePoints as returned from `getStrokePoints`.
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
export function getStrokeOutlinePoints(
  points: StrokePoint[],
  options: Partial<StrokeOptions> = {} as Partial<StrokeOptions>
): IVec[] {
  const {
    size = 16,
    smoothing = 0.5,
    thinning = 0.5,
    simulatePressure = true,
    easing = t => t,
    start = {},
    end = {},
    last: isComplete = false,
  } = options;

  const { cap: capStart = true, easing: taperStartEase = t => t * (2 - t) } =
    start;

  const { cap: capEnd = true, easing: taperEndEase = t => --t * t * t + 1 } =
    end;

  // We can't do anything with an empty array or a stroke with negative size.
  if (points.length === 0 || size <= 0) {
    return [];
  }

  // The total length of the line
  const totalLength = points[points.length - 1].runningLength;

  const taperStart =
    start.taper === false
      ? 0
      : start.taper === true
        ? Math.max(size, totalLength)
        : (start.taper as number);

  const taperEnd =
    end.taper === false
      ? 0
      : end.taper === true
        ? Math.max(size, totalLength)
        : (end.taper as number);

  // The minimum allowed distance between points (squared)
  const minDistance = Math.pow(size * smoothing, 2);

  // Our collected left and right points
  const leftPts: IVec[] = [];
  const rightPts: IVec[] = [];

  // Previous pressure (start with average of first five pressures,
  // in order to prevent fat starts for every line. Drawn lines
  // almost always start slow!
  let prevPressure = points.slice(0, 10).reduce((acc, curr) => {
    let pressure = curr.pressure;

    if (simulatePressure) {
      // Speed of change - how fast should the the pressure changing?
      const sp = min(1, curr.distance / size);
      // Rate of change - how much of a change is there?
      const rp = min(1, 1 - sp);
      // Accelerate the pressure
      pressure = min(1, acc + (rp - acc) * (sp * RATE_OF_PRESSURE_CHANGE));
    }

    return (acc + pressure) / 2;
  }, points[0].pressure);

  // The current radius
  let radius = getStrokeRadius(
    size,
    thinning,
    points[points.length - 1].pressure,
    easing
  );

  // The radius of the first saved point
  let firstRadius: number | undefined = undefined;

  // Previous vector
  let prevVector = points[0].vector;

  // Previous left and right points
  let pl = points[0].point;
  let pr = pl;

  // Temporary left and right points
  let tl = pl;
  let tr = pr;

  // Keep track of whether the previous point is a sharp corner
  // ... so that we don't detect the same corner twice
  let isPrevPointSharpCorner = false;

  // let short = true

  /*
    Find the outline's left and right points

    Iterating through the points and populate the rightPts and leftPts arrays,
    skipping the first and last pointsm, which will get caps later on.
  */

  for (let i = 0; i < points.length; i++) {
    let { pressure } = points[i];
    const { point, vector, distance, runningLength } = points[i];

    // Removes noise from the end of the line
    if (i < points.length - 1 && totalLength - runningLength < 3) {
      continue;
    }

    /*
      Calculate the radius

      If not thinning, the current point's radius will be half the size; or
      otherwise, the size will be based on the current (real or simulated)
      pressure.
    */

    if (thinning) {
      if (simulatePressure) {
        // If we're simulating pressure, then do so based on the distance
        // between the current point and the previous point, and the size
        // of the stroke. Otherwise, use the input pressure.
        const sp = min(1, distance / size);
        const rp = min(1, 1 - sp);
        pressure = min(
          1,
          prevPressure + (rp - prevPressure) * (sp * RATE_OF_PRESSURE_CHANGE)
        );
      }

      radius = getStrokeRadius(size, thinning, pressure, easing);
    } else {
      radius = size / 2;
    }

    if (firstRadius === undefined) {
      firstRadius = radius;
    }

    /*
      Apply tapering

      If the current length is within the taper distance at either the
      start or the end, calculate the taper strengths. Apply the smaller
      of the two taper strengths to the radius.
    */

    const ts =
      runningLength < taperStart
        ? taperStartEase(runningLength / taperStart)
        : 1;

    const te =
      totalLength - runningLength < taperEnd
        ? taperEndEase((totalLength - runningLength) / taperEnd)
        : 1;

    radius = Math.max(0.01, radius * Math.min(ts, te));

    /* Add points to left and right */

    /*
      Handle sharp corners

      Find the difference (dot product) between the current and next vector.
      If the next vector is at more than a right angle to the current vector,
      draw a cap at the current point.
    */

    const nextVector = (i < points.length - 1 ? points[i + 1] : points[i])
      .vector;
    const nextDpr = i < points.length - 1 ? dpr(vector, nextVector) : 1.0;
    const prevDpr = dpr(vector, prevVector);

    const isPointSharpCorner = prevDpr < 0 && !isPrevPointSharpCorner;
    const isNextPointSharpCorner = nextDpr !== null && nextDpr < 0;

    if (isPointSharpCorner || isNextPointSharpCorner) {
      // It's a sharp corner. Draw a rounded cap and move on to the next point
      // Considering saving these and drawing them later? So that we can avoid
      // crossing future points.

      const offset = mul(per(prevVector), radius);

      for (let step = 1 / 13, t = 0; t <= 1; t += step) {
        tl = rotAround(sub(point, offset), point, FIXED_PI * t);
        leftPts.push(tl);

        tr = rotAround(add(point, offset), point, FIXED_PI * -t);
        rightPts.push(tr);
      }

      pl = tl;
      pr = tr;

      if (isNextPointSharpCorner) {
        isPrevPointSharpCorner = true;
      }
      continue;
    }

    isPrevPointSharpCorner = false;

    // Handle the last point
    if (i === points.length - 1) {
      const offset = mul(per(vector), radius);
      leftPts.push(sub(point, offset));
      rightPts.push(add(point, offset));
      continue;
    }

    /*
      Add regular points

      Project points to either side of the current point, using the
      calculated size as a distance. If a point's distance to the
      previous point on that side greater than the minimum distance
      (or if the corner is kinda sharp), add the points to the side's
      points array.
    */

    const offset = mul(per(lrp(nextVector, vector, nextDpr)), radius);

    tl = sub(point, offset);

    if (i <= 1 || dist2(pl, tl) > minDistance) {
      leftPts.push(tl);
      pl = tl;
    }

    tr = add(point, offset);

    if (i <= 1 || dist2(pr, tr) > minDistance) {
      rightPts.push(tr);
      pr = tr;
    }

    // Set variables for next iteration
    prevPressure = pressure;
    prevVector = vector;
  }

  /*
    Drawing caps

    Now that we have our points on either side of the line, we need to
    draw caps at the start and end. Tapered lines don't have caps, but
    may have dots for very short lines.
  */

  const firstPoint = points[0].point.slice(0, 2) as IVec;

  const lastPoint =
    points.length > 1
      ? (points[points.length - 1].point.slice(0, 2) as IVec)
      : add(points[0].point, [1, 1]);

  const startCap: IVec[] = [];

  const endCap: IVec[] = [];

  /*
    Draw a dot for very short or completed strokes

    If the line is too short to gather left or right points and if the line is
    not tapered on either side, draw a dot. If the line is tapered, then only
    draw a dot if the line is both very short and complete. If we draw a dot,
    we can just return those points.
  */

  if (points.length === 1) {
    if (!(taperStart || taperEnd) || isComplete) {
      const start = prj(
        firstPoint,
        uni(per(sub(firstPoint, lastPoint))),
        -(firstRadius || radius)
      );
      const dotPts: IVec[] = [];
      for (let step = 1 / 13, t = step; t <= 1; t += step) {
        dotPts.push(rotAround(start, firstPoint, FIXED_PI * 2 * t));
      }
      return dotPts;
    }
  } else {
    /*
    Draw a start cap

    Unless the line has a tapered start, or unless the line has a tapered end
    and the line is very short, draw a start cap around the first point. Use
    the distance between the second left and right point for the cap's radius.
    Finally remove the first left and right points. :psyduck:
  */

    if (taperStart || (taperEnd && points.length === 1)) {
      // The start point is tapered, noop
    } else if (capStart) {
      // Draw the round cap - add thirteen points rotating the right point around the start point to the left point
      for (let step = 1 / 13, t = step; t <= 1; t += step) {
        const pt = rotAround(rightPts[0], firstPoint, FIXED_PI * t);
        startCap.push(pt);
      }
    } else {
      // Draw the flat cap - add a point to the left and right of the start point
      const cornersVector = sub(leftPts[0], rightPts[0]);
      const offsetA = mul(cornersVector, 0.5);
      const offsetB = mul(cornersVector, 0.51);

      startCap.push(
        sub(firstPoint, offsetA),
        sub(firstPoint, offsetB),
        add(firstPoint, offsetB),
        add(firstPoint, offsetA)
      );
    }

    /*
    Draw an end cap

    If the line does not have a tapered end, and unless the line has a tapered
    start and the line is very short, draw a cap around the last point. Finally,
    remove the last left and right points. Otherwise, add the last point. Note
    that This cap is a full-turn-and-a-half: this prevents incorrect caps on
    sharp end turns.
  */

    const direction = per(neg(points[points.length - 1].vector));

    if (taperEnd || (taperStart && points.length === 1)) {
      // Tapered end - push the last point to the line
      endCap.push(lastPoint);
    } else if (capEnd) {
      // Draw the round end cap
      const start = prj(lastPoint, direction, radius);
      for (let step = 1 / 29, t = step; t < 1; t += step) {
        endCap.push(rotAround(start, lastPoint, FIXED_PI * 3 * t));
      }
    } else {
      // Draw the flat end cap

      endCap.push(
        add(lastPoint, mul(direction, radius)),
        add(lastPoint, mul(direction, radius * 0.99)),
        sub(lastPoint, mul(direction, radius * 0.99)),
        sub(lastPoint, mul(direction, radius))
      );
    }
  }

  /*
    Return the points in the correct winding order: begin on the left side, then
    continue around the end cap, then come back along the right side, and finally
    complete the start cap.
  */

  return leftPts.concat(endCap, rightPts.reverse(), startCap);
}
