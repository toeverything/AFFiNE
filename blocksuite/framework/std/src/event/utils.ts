import { IS_IOS, IS_IPAD } from '@blocksuite/global/env';
import type { IPoint } from '@blocksuite/global/gfx';

export function isFarEnough(a: IPoint, b: IPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  // Desktop keeps a tight 2px threshold. On iPad, Pencil/finger jitter routinely
  // exceeds that, turning a tap into ContentMoving — and mindmap root drags call
  // layout() on every move, which freezes WKWebView.
  const thresholdSq = IS_IPAD || IS_IOS ? 64 : 4;
  return Math.pow(dx, 2) + Math.pow(dy, 2) > thresholdSq;
}

export function center(a: IPoint, b: IPoint) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export const toLowerCase = <T extends string>(str: T): Lowercase<T> =>
  str.toLowerCase() as Lowercase<T>;
