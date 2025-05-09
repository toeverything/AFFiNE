import { clamp } from '@blocksuite/global/gfx';

import { GRID_GAP_MAX, GRID_GAP_MIN } from '../consts';

export function getBgGridGap(zoom: number) {
  const step = zoom < 0.5 ? 2 : 1 / (Math.floor(zoom) || 1);
  const gap = clamp(20 * step * zoom, GRID_GAP_MIN, GRID_GAP_MAX);

  return Math.round(gap);
}
