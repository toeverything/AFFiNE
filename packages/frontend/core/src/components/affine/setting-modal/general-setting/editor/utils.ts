import { FontWeight } from '@blocksuite/affine/blocks';
import { useTheme } from 'next-themes';

function getColorFromMap(
  color: string | { normal: string } | { light: string; dark: string },
  colorMap: { [key: string]: string },
  theme: 'light' | 'dark' = 'light'
):
  | {
      value: string;
      key: string;
    }
  | undefined {
  if (typeof color === 'string') {
    return { value: color, key: colorMap[color] };
  }

  if ('normal' in color) {
    return {
      value: color.normal,
      key: colorMap[color.normal],
    };
  }

  if ('light' in color && 'dark' in color) {
    return {
      value: color[theme],
      key: colorMap[color[theme]],
    };
  }

  return undefined;
}

export const useColor = () => {
  const { resolvedTheme } = useTheme();
  return (
    color: string | { normal: string } | { light: string; dark: string },
    colorMap: { [key: string]: string }
  ) =>
    getColorFromMap(
      color,
      colorMap,
      resolvedTheme as 'light' | 'dark' | undefined
    );
};

export const sortedFontWeightEntries = Object.entries(FontWeight).sort(
  (a, b) => Number(a[1]) - Number(b[1])
);
