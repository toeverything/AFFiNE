import { ShapeType } from '@blocksuite/affine-model';
import { describe, expect, it } from 'vitest';

import {
  ExtendedShapeConfig,
  ShapeComponentConfig,
} from '../toolbar/shape-menu-config.js';

describe('shape menu config', () => {
  it('contains core shapes', () => {
    const names = ShapeComponentConfig.map(entry => entry.name);
    expect(names).toContain(ShapeType.Rect);
    expect(names).toContain('roundedRect');
    expect(names).toContain(ShapeType.Ellipse);
    expect(names).toContain(ShapeType.Diamond);
  });

  it('contains advanced shapes in extended config', () => {
    const names = ExtendedShapeConfig.map(entry => entry.name);
    expect(names).toContain(ShapeType.Container);
    expect(names).toContain(ShapeType.VerticalContainer);
    expect(names).toContain(ShapeType.HorizontalContainer);
    expect(names).toContain(ShapeType.MindmapCentralIdea);
    expect(names).toContain(ShapeType.MindmapBranch);
    expect(names).toContain(ShapeType.MindmapSubTopic);
    expect(names).toContain(ShapeType.MindmapSquare);
  });

  it('does not duplicate shape entries in each config', () => {
    const baseNames = ShapeComponentConfig.map(entry => entry.name);
    const uniqueBaseNames = new Set(baseNames);
    expect(uniqueBaseNames.size).toBe(baseNames.length);

    const extendedNames = ExtendedShapeConfig.map(entry => entry.name);
    const uniqueExtendedNames = new Set(extendedNames);
    expect(uniqueExtendedNames.size).toBe(extendedNames.length);
  });
});
