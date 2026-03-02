import { describe, expect, it } from 'vitest';

import {
  getShapePaletteData,
  shapePaletteKeys,
  shapePalettes,
} from '../draggable/palettes.js';

describe('shape palettes', () => {
  it('returns palette data aligned with palette keys', () => {
    const data = getShapePaletteData(0);

    expect(data.fillPalettes).toHaveLength(shapePaletteKeys.length);
    expect(data.strokePalettes).toHaveLength(shapePaletteKeys.length);
    expect(data.stylesByKey.size).toBe(shapePaletteKeys.length);

    shapePaletteKeys.forEach(key => {
      expect(data.stylesByKey.has(key)).toBe(true);
    });
  });

  it('exposes gradient palettes for gradient-enabled palette', () => {
    const gradientIndex = shapePalettes.findIndex(
      palette => palette.id === 'dio4'
    );
    expect(gradientIndex).toBeGreaterThanOrEqual(0);

    const data = getShapePaletteData(gradientIndex);
    expect(data.gradientPalettes.length).toBeGreaterThan(0);

    const palette = shapePalettes[gradientIndex];
    data.gradientPalettes.forEach(entry => {
      const styleIndex = shapePaletteKeys.indexOf(entry.key);
      expect(styleIndex).toBeGreaterThanOrEqual(0);
      expect(palette.styles[styleIndex]?.gradientFinal).toBe(entry.value);
    });

    const hasDirection = data.gradientPalettes.some(
      entry => entry.direction === 'S'
    );
    expect(hasDirection).toBe(true);
  });
});
