export function almostEqual(a: number, b: number, epsilon = 0.0001) {
  return Math.abs(a - b) < epsilon;
}

export function rangeWrap(n: number, min: number, max: number) {
  max = max - min;
  n = (n - min + max) % max;
  return min + (Number.isNaN(n) ? 0 : n);
}
