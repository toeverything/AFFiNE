import { clamp } from '@blocksuite/global/gfx';

import { GRID_GAP_MAX, GRID_GAP_MIN } from '../consts';

export function getBgGridGap(zoom: number, baseSize: number = 20) {
  const step = zoom < 0.5 ? 2 : 1 / (Math.floor(zoom) || 1);
  const gap = clamp(baseSize * step * zoom, GRID_GAP_MIN, GRID_GAP_MAX);

  return Math.round(gap);
}
