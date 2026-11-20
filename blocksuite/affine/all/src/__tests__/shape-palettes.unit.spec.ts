import {
  filterShapePalettes,
  getShapePaletteDataFrom,
  shapePalettes,
} from '@blocksuite/affine-gfx-shape';
import { DefaultTheme } from '@blocksuite/affine-model';
import { describe, expect, it } from 'vitest';

describe('shape palettes', () => {
  it('uses DefaultTheme shape palette definitions', () => {
    expect(shapePalettes).toBe(DefaultTheme.ShapePalettes);
    expect(shapePalettes.length).toBeGreaterThan(0);
  });

  it('keeps final three swatches as white, black, transparent', () => {
    for (const palette of shapePalettes) {
      const styles = palette.styles;
      expect(styles.at(-3)?.fill).toBe(DefaultTheme.FillColorShortMap.White);
      expect(styles.at(-3)?.stroke).toBe(DefaultTheme.FillColorShortMap.White);

      expect(styles.at(-2)?.fill).toBe(DefaultTheme.FillColorShortMap.Black);
      expect(styles.at(-2)?.stroke).toBe(DefaultTheme.FillColorShortMap.Black);

      expect(styles.at(-1)?.fill).toBe(
        DefaultTheme.FillColorShortMap.Transparent
      );
      expect(styles.at(-1)?.stroke).toBe(DefaultTheme.StrokeColorShortMap.Grey);
    }
  });

  it('honors line and fill visibility flags with fallback', () => {
    const line = filterShapePalettes(shapePalettes, 'line');
    expect(line.every(palette => palette.showInLine !== false)).toBe(true);

    const fill = filterShapePalettes(shapePalettes, 'fill');
    expect(fill.every(palette => palette.showInFill !== false)).toBe(true);

    const fallbackLine = filterShapePalettes(
      shapePalettes.map(p => ({ ...p, showInLine: false })),
      'line'
    );
    expect(fallbackLine).toBe(shapePalettes);
  });

  it('exposes palette data by index consistently', () => {
    const { palette, fillPalettes, strokePalettes } = getShapePaletteDataFrom(
      shapePalettes,
      0
    );
    expect(palette.id).toBe(shapePalettes[0].id);
    expect(fillPalettes.length).toBe(
      DefaultTheme.FillColorShortPalettes.length
    );
    expect(strokePalettes.length).toBe(
      DefaultTheme.FillColorShortPalettes.length
    );
  });
});
