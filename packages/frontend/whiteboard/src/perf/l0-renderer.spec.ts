import { describe, expect, it, vi } from 'vitest';

import { WHITEBOARD_FLAVOURS } from '../const';
import { drawSprites2d } from './l0-renderer';
import { toL0Sprites } from './l0-scene';

describe('whiteboard L0 renderer', () => {
  it('paints culled AABB quads and skips live sprites', () => {
    const fills: string[] = [];
    const rects: Array<[number, number, number, number]> = [];
    const ctx = {
      clearRect: vi.fn(),
      fillRect: (x: number, y: number, w: number, h: number) => {
        rects.push([x, y, w, h]);
      },
      set fillStyle(value: string) {
        fills.push(value);
      },
    };

    const sprites = toL0Sprites([
      { id: 'a', flavour: WHITEBOARD_FLAVOURS.chart, xywh: '[0,0,100,50]' },
      {
        id: 'b',
        flavour: WHITEBOARD_FLAVOURS.sketch,
        xywh: '[10,10,40,40]',
        selected: true,
      },
    ]);

    drawSprites2d(ctx, sprites, {
      viewportX: 0,
      viewportY: 0,
      zoom: 0.25,
      viewScale: 1,
      width: 400,
      height: 300,
    });

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual([0, 0, 25, 12.5]);
    expect(fills[0]).toMatch(/^rgba\(/);
  });
});
