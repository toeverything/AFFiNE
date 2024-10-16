import {
  AffineCanvasTextFonts,
  FontConfigExtension,
} from '@blocksuite/affine/blocks';

export function getFontConfigExtension() {
  return FontConfigExtension(
    AffineCanvasTextFonts.map(font => ({
      ...font,
      url: environment.publicPath + 'fonts/' + font.url.split('/').pop(),
    }))
  );
}
