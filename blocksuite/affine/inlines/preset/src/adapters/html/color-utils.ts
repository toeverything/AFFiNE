import { parseStringToRgba } from '@blocksuite/affine-components/color-picker';
import { cssVarV2, darkThemeV2, lightThemeV2 } from '@toeverything/theme/v2';

type Rgb = { r: number; g: number; b: number };

const COLOR_DISTANCE_THRESHOLD = 90;
const supportedTextColorNames = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'grey',
] as const;

const supportedTextColors = supportedTextColorNames.map(name => ({
  name,
  cssVar: cssVarV2(`text/highlight/fg/${name}`),
  light: lightThemeV2[`text/highlight/fg/${name}`],
  dark: darkThemeV2[`text/highlight/fg/${name}`],
}));

const hexToRgb = (value: string): Rgb | null => {
  const hex = value.replace('#', '');
  if (![3, 4, 6, 8].includes(hex.length)) {
    return null;
  }
  const normalized =
    hex.length === 3 || hex.length === 4
      ? hex
          .slice(0, 3)
          .split('')
          .map(c => c + c)
          .join('')
      : hex.slice(0, 6);
  const intVal = Number.parseInt(normalized, 16);
  if (Number.isNaN(intVal)) {
    return null;
  }
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
};

export const parseCssColor = (value: string): Rgb | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('#')) {
    return hexToRgb(trimmed);
  }
  if (/^rgba?\(/i.test(trimmed)) {
    const rgba = parseStringToRgba(trimmed);
    return {
      r: Math.round(rgba.r * 255),
      g: Math.round(rgba.g * 255),
      b: Math.round(rgba.b * 255),
    };
  }
  return null;
};

const colorDistance = (a: Rgb, b: Rgb) => {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

export const resolveNearestSupportedColor = (color: string): string | null => {
  const target = parseCssColor(color);
  if (!target) {
    return null;
  }
  let nearest:
    | {
        cssVar: string;
        distance: number;
      }
    | undefined;

  for (const supported of supportedTextColors) {
    const light = parseCssColor(supported.light);
    const dark = parseCssColor(supported.dark);
    for (const ref of [light, dark]) {
      if (!ref) continue;
      const distance = colorDistance(target, ref);
      if (!nearest || distance < nearest.distance) {
        nearest = { cssVar: supported.cssVar, distance };
      }
    }
  }

  if (nearest && nearest.distance <= COLOR_DISTANCE_THRESHOLD) {
    return nearest.cssVar;
  }
  return null;
};

export const extractColorFromStyle = (
  style: string | undefined
): string | null => {
  if (typeof style !== 'string') {
    return null;
  }
  const declarations = style.split(';');
  for (const declaration of declarations) {
    const [rawKey, rawValue] = declaration.split(':');
    if (!rawKey || !rawValue) continue;
    if (rawKey.trim().toLowerCase() === 'color') {
      return rawValue.trim();
    }
  }
  return null;
};
