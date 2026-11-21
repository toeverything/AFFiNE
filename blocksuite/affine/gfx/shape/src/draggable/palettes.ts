import {
  DefaultTheme,
  type Palette,
  type ShapePalette,
  type ShapePaletteStyle,
} from '@blocksuite/affine-model';

export type { ShapePalette, ShapePaletteStyle };

export const SHAPE_PALETTES_STORAGE_VERSION = 1;
export const SHAPE_PALETTES_STORAGE_EVENT = 'affine:shape-palettes-updated';

export function getShapePalettesStorageKey(workspaceId: string) {
  return `affine:workspace:${workspaceId}:shape-palettes:v${SHAPE_PALETTES_STORAGE_VERSION}`;
}

export const shapePaletteKeys = DefaultTheme.FillColorShortPalettes.map(
  palette => palette.key
);

export const shapePalettes: ShapePalette[] = DefaultTheme.ShapePalettes;

export function getShapePaletteData(index: number) {
  return getShapePaletteDataFrom(shapePalettes, index);
}

export function getShapePaletteDataFrom(
  palettes: ShapePalette[],
  index: number
) {
  const source = palettes.length ? palettes : shapePalettes;
  const palette = source[index % source.length];
  const stylesByKey = new Map(
    shapePaletteKeys.map((key, styleIndex) => [key, palette.styles[styleIndex]])
  );
  const fillPalettes = shapePaletteKeys.map((key, styleIndex) => ({
    key,
    value: palette.styles[styleIndex].fill,
  }));
  const strokePalettes = shapePaletteKeys.map((key, styleIndex) => ({
    key,
    value: palette.styles[styleIndex].stroke,
  }));
  const ringPalettes = shapePaletteKeys
    .map((key, styleIndex) => ({
      key,
      value: palette.styles[styleIndex].ringColor,
    }))
    .filter(item => item.value !== undefined) as Palette[];
  const gradientPalettes = shapePaletteKeys
    .map((key, styleIndex) => ({
      key,
      value: palette.styles[styleIndex].gradientFinal,
      direction: palette.styles[styleIndex].gradientDirection,
    }))
    .filter(item => item.value !== undefined) as {
    key: string;
    value: Palette['value'];
    direction?: ShapePaletteStyle['gradientDirection'];
  }[];

  return {
    palette,
    stylesByKey,
    fillPalettes,
    strokePalettes,
    ringPalettes,
    gradientPalettes,
  };
}

export function readStoredShapePalettes(
  workspaceId: string | undefined
): ShapePalette[] | null {
  if (!workspaceId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getShapePalettesStorageKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShapePalette[];
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const valid = parsed.filter(
      palette =>
        palette &&
        typeof palette.id === 'string' &&
        Array.isArray(palette.styles) &&
        palette.styles.length >= shapePaletteKeys.length
    );
    return valid.length ? valid : null;
  } catch {
    return null;
  }
}

export function filterShapePalettes(
  palettes: ShapePalette[],
  target: 'line' | 'fill'
) {
  const filtered = palettes.filter(palette =>
    target === 'line'
      ? palette.showInLine !== false
      : palette.showInFill !== false
  );

  return filtered.length ? filtered : shapePalettes;
}
