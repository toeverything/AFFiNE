import type { IPoint } from '@blocksuite/global/gfx';

export function isFarEnough(a: IPoint, b: IPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.pow(dx, 2) + Math.pow(dy, 2) > 4;
}

export function center(a: IPoint, b: IPoint) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export const toLowerCase = <T extends string>(str: T): Lowercase<T> =>
  str.toLowerCase() as Lowercase<T>;
