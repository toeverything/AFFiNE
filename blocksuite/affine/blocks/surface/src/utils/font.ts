import type { FontFamily } from '@blocksuite/affine-model';
import { IS_FIREFOX } from '@blocksuite/global/env';

export function wrapFontFamily(fontFamily: FontFamily | string): string {
  return `"${fontFamily}"`;
}

export const getFontFaces = IS_FIREFOX
  ? () => {
      const keys = document.fonts.keys();
      const fonts = [];
      let done = false;
      while (!done) {
        const item = keys.next();
        done = !!item.done;
        if (item.value) {
          fonts.push(item.value);
        }
      }
      return fonts;
    }
  : () => [...document.fonts.keys()];

export const isSameFontFamily = IS_FIREFOX
  ? (fontFamily: FontFamily | string) => (fontFace: FontFace) =>
      fontFace.family === `"${fontFamily}"`
  : (fontFamily: FontFamily | string) => (fontFace: FontFace) =>
      fontFace.family === fontFamily;

export function getFontFacesByFontFamily(
  fontFamily: FontFamily | string
): FontFace[] {
  return (
    getFontFaces()
      .filter(isSameFontFamily(fontFamily))
      // remove duplicate font faces
      .filter(
        (item, index, arr) =>
          arr.findIndex(
            fontFace =>
              fontFace.family === item.family &&
              fontFace.weight === item.weight &&
              fontFace.style === item.style
          ) === index
      )
  );
}
