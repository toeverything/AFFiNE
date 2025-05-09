import type { IVec, IVec3 } from '../model/index.js';
import { getStroke } from './get-stroke.js';

export function getSolidStrokePoints(
  points: (IVec | IVec3)[],
  lineWidth: number
) {
  return getStroke(points, {
    size: lineWidth,
    thinning: 0.6,
    streamline: 0.5,
    smoothing: 0.5,
    easing: t => Math.sin((t * Math.PI) / 2),
    simulatePressure: points[0]?.length === 2,
  });
}
