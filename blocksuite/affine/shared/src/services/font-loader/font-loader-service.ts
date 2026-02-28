import { createIdentifier } from '@blocksuite/global/di';
import { IS_FIREFOX } from '@blocksuite/global/env';
import { LifeCycleWatcher } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';

import type { FontConfig } from './config.js';

const initFontFace = IS_FIREFOX
  ? ({ font, weight, url, style }: FontConfig) =>
      new FontFace(`"${font}"`, `url(${url})`, {
        weight,
        style,
      })
  : ({ font, weight, url, style }: FontConfig) =>
      new FontFace(font, `url(${url})`, {
        weight,
        style,
      });

export class FontLoaderService extends LifeCycleWatcher {
  static override readonly key = 'font-loader';

  readonly fontFaces: FontFace[] = [];

  get ready() {
    return Promise.all(this.fontFaces.map(fontFace => fontFace.loaded));
  }

  load(fonts: FontConfig[]) {
    this.fontFaces.push(
      ...fonts.map(font => {
        const fontFace = initFontFace(font);
        document.fonts.add(fontFace);
        fontFace.load().catch(console.error);
        return fontFace;
      })
    );
  }

  override mounted() {
    const config = this.std.getOptional(FontConfigIdentifier);
    if (config) {
      this.load(config);
    }
  }

  override unmounted() {
    this.fontFaces.forEach(fontFace => document.fonts.delete(fontFace));
    this.fontFaces.splice(0, this.fontFaces.length);
  }
}

export const FontConfigIdentifier =
  createIdentifier<FontConfig[]>('AffineFontConfig');

export const FontConfigExtension = (
  fontConfig: FontConfig[]
): ExtensionType => ({
  setup: di => {
    di.addImpl(FontConfigIdentifier, () => fontConfig);
  },
});
