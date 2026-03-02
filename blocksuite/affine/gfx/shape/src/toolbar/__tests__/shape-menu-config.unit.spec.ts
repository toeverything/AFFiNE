import { ShapeType } from '@blocksuite/affine-model';
import { describe, expect, it } from 'vitest';

import { ShapeComponentConfig } from '../shape-menu-config.js';

describe('shape menu config', () => {
  it('contains core shapes', () => {
    const names = ShapeComponentConfig.map(entry => entry.name);
    expect(names).toContain(ShapeType.Rect);
    expect(names).toContain('roundedRect');
    expect(names).toContain(ShapeType.Ellipse);
    expect(names).toContain(ShapeType.Diamond);
  });

  it('does not duplicate shape entries', () => {
    const names = ShapeComponentConfig.map(entry => entry.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});
