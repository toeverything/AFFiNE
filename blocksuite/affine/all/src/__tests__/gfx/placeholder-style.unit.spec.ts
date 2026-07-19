import { ColorScheme } from '@blocksuite/affine-model';
import { describe, expect, it } from 'vitest';

import {
  getAffinePlaceholderFillColor,
  getAffinePlaceholderStrokeColor,
  inferColorSchemeFromThemeMode,
} from '../../../../shared/src/theme/placeholder-style.js';

describe('affine placeholder style', () => {
  it('returns subtle light placeholder colors', () => {
    expect(getAffinePlaceholderFillColor(ColorScheme.Light)).toBe(
      'rgba(0, 0, 0, 0.04)'
    );
    expect(getAffinePlaceholderStrokeColor(ColorScheme.Light)).toBe(
      'rgba(0, 0, 0, 0.02)'
    );
  });

  it('returns subtle dark placeholder colors', () => {
    expect(getAffinePlaceholderFillColor(ColorScheme.Dark)).toBe(
      'rgba(255, 255, 255, 0.08)'
    );
    expect(getAffinePlaceholderStrokeColor(ColorScheme.Dark)).toBe(
      'rgba(255, 255, 255, 0.04)'
    );
  });

  it('infers color scheme from theme mode', () => {
    expect(inferColorSchemeFromThemeMode('dark')).toBe(ColorScheme.Dark);
    expect(inferColorSchemeFromThemeMode('light')).toBe(ColorScheme.Light);
    expect(inferColorSchemeFromThemeMode('')).toBe(ColorScheme.Light);
  });
});
