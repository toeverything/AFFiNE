import {
  type Color,
  ColorScheme,
  FontWeight,
  type Palette,
  resolveColor,
} from '@blocksuite/affine/model';
import { isEqual } from 'lodash-es';
import { useTheme } from 'next-themes';

export const useResolvedTheme = () => {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === ColorScheme.Dark
    ? ColorScheme.Dark
    : ColorScheme.Light;
};

export const usePalettes = (
  originalPalettes: Palette[],
  defaultColor: Color,
  isShapeText = false
) => {
  const theme = useResolvedTheme();
  const isDark = theme === ColorScheme.Dark;
  const palettes = originalPalettes.map(({ key, value }) => {
    // Title needs to be inverted.
    if (!isShapeText && isDark) {
      if (key === 'Black') {
        key = 'White';
      } else if (key === 'White') {
        key = 'Black';
      }
    }

    return {
      key,
      value,
      resolvedValue: resolveColor(value, theme),
    };
  });
  return {
    palettes,
    getCurrentColor: (color: Color) =>
      palettes.find(({ value }) => isEqual(value, color)) ||
      palettes.find(({ value }) => isEqual(value, defaultColor)),
  };
};

export const sortedFontWeightEntries = Object.entries(FontWeight).sort(
  (a, b) => Number(a[1]) - Number(b[1])
);
