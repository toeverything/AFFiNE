import { describe, expect, it } from 'vitest';

import { WHITEBOARD_FLAVOURS, WHITEBOARD_LOD } from '../const';
import {
  cullSprites,
  flavourFill,
  hitTestSprites,
  isL0HostFlavour,
  l0DrawableSprites,
  parseXywhRect,
  shouldActivateL0Layer,
  spriteToView,
  toL0Sprites,
} from './l0-scene';

describe('whiteboard L0 scene', () => {
  it('activates only when the flag is on and zoom is below z0', () => {
    expect(shouldActivateL0Layer(WHITEBOARD_LOD.z0 - 0.01, true)).toBe(true);
    expect(shouldActivateL0Layer(WHITEBOARD_LOD.z0, true)).toBe(false);
    expect(shouldActivateL0Layer(0.1, false)).toBe(false);
    expect(shouldActivateL0Layer(1, true)).toBe(false);
  });

  it('skips surface/page hosts and parses xywh', () => {
    expect(isL0HostFlavour('affine:surface')).toBe(false);
    expect(isL0HostFlavour('affine:page')).toBe(false);
    expect(isL0HostFlavour(WHITEBOARD_FLAVOURS.chart)).toBe(true);
    expect(parseXywhRect('[10,20,30,40]')).toEqual({
      x: 10,
      y: 20,
      w: 30,
      h: 40,
    });
    expect(parseXywhRect('nope')).toBeNull();
  });

  it('builds sprites, culls offscreen, and hit-tests top-most non-live', () => {
    const sprites = toL0Sprites([
      {
        id: 'note',
        flavour: 'affine:note',
        xywh: '[0,0,100,80]',
      },
      {
        id: 'chart',
        flavour: WHITEBOARD_FLAVOURS.chart,
        xywh: '[50,20,120,90]',
      },
      {
        id: 'live',
        flavour: WHITEBOARD_FLAVOURS.sketch,
        xywh: '[40,10,80,80]',
        selected: true,
      },
      {
        id: 'offscreen',
        flavour: WHITEBOARD_FLAVOURS.hello,
        xywh: '[2000,2000,40,40]',
      },
    ]);
    expect(sprites).toHaveLength(4);
    expect(sprites[1]?.fill).toEqual(flavourFill(WHITEBOARD_FLAVOURS.chart));
    expect(sprites[2]?.live).toBe(true);

    const visible = cullSprites(sprites, { x: 0, y: 0, w: 400, h: 300 });
    expect(visible.map(sprite => sprite.id)).toEqual(['note', 'chart', 'live']);

    const hit = hitTestSprites(visible, 70, 40);
    expect(hit?.id).toBe('chart');
    // (110,15) is only on the selected sketch — live sprites stay in DOM.
    expect(hitTestSprites(visible, 110, 15)?.id).toBeUndefined();
    expect(l0DrawableSprites(visible).map(sprite => sprite.id)).toEqual([
      'note',
      'chart',
    ]);
  });

  it('maps model AABB into view space with zoom and viewScale', () => {
    const [sprite] = toL0Sprites([
      { id: 'a', flavour: 'affine:note', xywh: '[100,50,20,10]' },
    ]);
    expect(sprite).toBeTruthy();
    expect(
      spriteToView(sprite!, {
        viewportX: 80,
        viewportY: 40,
        zoom: 0.5,
        viewScale: 2,
        width: 800,
        height: 600,
      })
    ).toEqual({ x: 20, y: 10, w: 20, h: 10 });
  });
});
