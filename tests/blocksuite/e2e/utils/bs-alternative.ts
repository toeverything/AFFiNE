import { clamp } from '@blocksuite/global/gfx';

export const BLOCK_CHILDREN_CONTAINER_PADDING_LEFT = 24;
export const NOTE_MIN_WIDTH = 450 + 24 * 2;
export const NOTE_MIN_HEIGHT = 92;

export const DEFAULT_NOTE_WIDTH = NOTE_MIN_WIDTH;
export const DEFAULT_NOTE_HEIGHT = NOTE_MIN_HEIGHT;

export enum NoteDisplayMode {
  DocAndEdgeless = 'both',
  DocOnly = 'doc',
  EdgelessOnly = 'edgeless',
}

export const bound01 = (n: number, max: number) => {
  n = clamp(0, n, max);

  // Handle floating point rounding errors
  if (Math.abs(n - max) < 0.000001) {
    return 1;
  }

  // Convert into [0, 1] range if it isn't already
  return (n % max) / max;
};

export const parseHexToRgba = (hex: string) => {
  if (hex.startsWith('#')) {
    hex = hex.substring(1);
  }

  const len = hex.length;
  let arr: string[] = [];

  if (len === 3 || len === 4) {
    arr = hex.split('').map(s => s.repeat(2));
  } else if (len === 6 || len === 8) {
    arr = Array.from<number>({ length: len / 2 })
      .fill(0)
      .map((n, i) => n + i * 2)
      .map(n => hex.substring(n, n + 2));
  }

  const [r, g, b, a = 1] = arr
    .map(s => parseInt(s, 16))
    .map(n => bound01(n, 255));

  return { r, g, b, a };
};

export const parseStringToRgba = (value: string) => {
  value = value.trim();

  // Compatible old format: `--affine-palette-transparent`
  if (value.endsWith('transparent')) {
    return { r: 1, g: 1, b: 1, a: 0 };
  }

  if (value.startsWith('#')) {
    return parseHexToRgba(value);
  }

  if (value.startsWith('rgb')) {
    const [r, g, b, a = 1] = value
      .replace(/^rgba?/, '')
      .replace(/\(|\)/, '')
      .split(',')
      .map(s => parseFloat(s.trim()))
      // In CSS, the alpha is already in the range [0, 1]
      .map((n, i) => bound01(n, i === 3 ? 1 : 255));

    return { r, g, b, a };
  }

  return { r: 0, g: 0, b: 0, a: 1 };
};
