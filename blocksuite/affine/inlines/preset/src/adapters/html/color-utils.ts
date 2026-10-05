import { TinyColor } from '@ctrl/tinycolor';
import { cssVarV2, darkThemeV2, lightThemeV2 } from '@toeverything/theme/v2';

type Rgb = { r: number; g: number; b: number };
type Oklab = { l: number; a: number; b: number; chroma: number; hue: number };

const ACHROMATIC_CHROMA_THRESHOLD = 0.02;
const DEFAULT_TEXT_LIGHTNESS_MIN = 0.4;
const DEFAULT_TEXT_LIGHTNESS_MAX = 0.9;
const MAX_COLOR_DISTANCE = 0.18;
const MAX_CHROMA_DISTANCE = 0.12;
const MAX_HUE_DISTANCE = 45;

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

export const parseCssColor = (value: string) => {
  const parsed = new TinyColor(value);
  if (!parsed.isValid) return null;
  const { r, g, b, a } = parsed.toRgb();
  return { r, g, b, alpha: a };
};

const srgbToLinear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
};

const rgbToOklab = ({ r, g, b }: Rgb): Oklab => {
  const red = srgbToLinear(r);
  const green = srgbToLinear(g);
  const blue = srgbToLinear(b);
  const l = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  );
  const m = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  );
  const s = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  );
  const result = {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
  return {
    ...result,
    chroma: Math.hypot(result.a, result.b),
    hue: (Math.atan2(result.b, result.a) * 180) / Math.PI,
  };
};

const supportedTextColors = supportedTextColorNames.map(name => ({
  name,
  cssVar: cssVarV2(`text/highlight/fg/${name}`),
  references: [
    lightThemeV2[`text/highlight/fg/${name}`],
    darkThemeV2[`text/highlight/fg/${name}`],
  ].flatMap(color => {
    const parsed = parseCssColor(color);
    return parsed ? [rgbToOklab(parsed)] : [];
  }),
}));

const colorDistance = (a: Oklab, b: Oklab) =>
  Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);

const hueDistance = (a: number, b: number) => {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
};

export const resolveNearestSupportedColor = (color: string): string | null => {
  const parsed = parseCssColor(color);
  if (!parsed || parsed.alpha < 1) {
    return null;
  }

  const target = rgbToOklab(parsed);
  const achromatic = target.chroma < ACHROMATIC_CHROMA_THRESHOLD;
  if (
    achromatic &&
    (target.l < DEFAULT_TEXT_LIGHTNESS_MIN ||
      target.l > DEFAULT_TEXT_LIGHTNESS_MAX)
  ) {
    return null;
  }

  let nearest:
    | {
        cssVar: string;
        distance: number;
      }
    | undefined;

  for (const supported of supportedTextColors) {
    if (achromatic !== (supported.name === 'grey')) {
      continue;
    }
    for (const reference of supported.references) {
      const distance = colorDistance(target, reference);
      if (
        distance > MAX_COLOR_DISTANCE ||
        (!achromatic &&
          (Math.abs(target.chroma - reference.chroma) > MAX_CHROMA_DISTANCE ||
            hueDistance(target.hue, reference.hue) > MAX_HUE_DISTANCE))
      ) {
        continue;
      }
      if (!nearest || distance < nearest.distance) {
        nearest = { cssVar: supported.cssVar, distance };
      }
    }
  }

  return nearest?.cssVar ?? null;
};

export const extractColorFromStyle = (
  style: string | undefined
): string | null => {
  if (typeof style !== 'string') {
    return null;
  }
  const declarations = style.split(';');
  for (const declaration of declarations) {
    const colon = declaration.indexOf(':');
    if (colon === -1) continue;
    const key = declaration.slice(0, colon).trim().toLowerCase();
    if (key === 'color') {
      return declaration.slice(colon + 1).trim();
    }
  }
  return null;
};
