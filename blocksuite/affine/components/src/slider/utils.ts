import type { SliderRange } from './types';

export function isDiscreteRange(range: unknown): range is SliderRange {
  return (
    typeof range === 'object' &&
    range !== null &&
    'points' in range &&
    Array.isArray(range.points)
  );
}
