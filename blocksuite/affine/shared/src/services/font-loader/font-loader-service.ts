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

  private static readonly DEFERRED_LOAD_DELAY_MS = 5000;

  private static readonly DEFERRED_LOAD_BATCH_SIZE = 4;

  private static readonly DEFERRED_LOAD_BATCH_INTERVAL_MS = 1000;

  private _idleLoadTaskId: number | null = null;

  private _lazyLoadTimeoutId: number | null = null;

  private _deferredFontsQueue: FontConfig[] = [];

  private _deferredFontsCursor = 0;

  private readonly _loadedFontKeys = new Set<string>();

  readonly fontFaces: FontFace[] = [];

  get ready() {
    return Promise.all(this.fontFaces.map(fontFace => fontFace.loaded));
  }

  private readonly _fontKey = ({ font, weight, style, url }: FontConfig) => {
    return `${font}:${weight}:${style}:${url}`;
  };

  private readonly _scheduleDeferredLoad = (fonts: FontConfig[]) => {
    if (fonts.length === 0 || typeof window === 'undefined') {
      return;
    }
    this._deferredFontsQueue = fonts;
    this._deferredFontsCursor = 0;

    const win = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number }
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const scheduleBatch = (delayMs: number) => {
      this._lazyLoadTimeoutId = window.setTimeout(() => {
        this._lazyLoadTimeoutId = null;
        const runBatch = () => {
          this._idleLoadTaskId = null;

          const start = this._deferredFontsCursor;
          const end = Math.min(
            start + FontLoaderService.DEFERRED_LOAD_BATCH_SIZE,
            this._deferredFontsQueue.length
          );
          const batch = this._deferredFontsQueue.slice(start, end);
          this._deferredFontsCursor = end;
          this.load(batch);

          if (this._deferredFontsCursor < this._deferredFontsQueue.length) {
            scheduleBatch(FontLoaderService.DEFERRED_LOAD_BATCH_INTERVAL_MS);
          }
        };

        if (typeof win.requestIdleCallback === 'function') {
          this._idleLoadTaskId = win.requestIdleCallback(runBatch, {
            timeout: 2000,
          });
          return;
        }
        runBatch();
      }, delayMs);
    };

    scheduleBatch(FontLoaderService.DEFERRED_LOAD_DELAY_MS);
  };

  private readonly _cancelDeferredLoad = () => {
    if (typeof window === 'undefined') {
      return;
    }

    const win = window as Window & {
      cancelIdleCallback?: (handle: number) => void;
    };

    if (
      this._idleLoadTaskId !== null &&
      typeof win.cancelIdleCallback === 'function'
    ) {
      win.cancelIdleCallback(this._idleLoadTaskId);
      this._idleLoadTaskId = null;
    }
    if (this._lazyLoadTimeoutId !== null) {
      window.clearTimeout(this._lazyLoadTimeoutId);
      this._lazyLoadTimeoutId = null;
    }
    this._deferredFontsQueue = [];
    this._deferredFontsCursor = 0;
  };

  load(fonts: FontConfig[]) {
    for (const font of fonts) {
      const key = this._fontKey(font);
      if (this._loadedFontKeys.has(key)) {
        continue;
      }
      this._loadedFontKeys.add(key);
      const fontFace = initFontFace(font);
      document.fonts.add(fontFace);
      fontFace.load().catch(console.error);
      this.fontFaces.push(fontFace);
    }
  }

  override mounted() {
    const config = this.std.getOptional(FontConfigIdentifier);
    if (!config || config.length === 0) {
      return;
    }
    const eagerFonts = config.slice(0, 3);
    const deferredFonts = config.slice(3);
    this.load(eagerFonts);
    this._scheduleDeferredLoad(deferredFonts);
  }

  override unmounted() {
    this._cancelDeferredLoad();
    for (const fontFace of this.fontFaces) {
      document.fonts.delete(fontFace);
    }
    this.fontFaces.splice(0, this.fontFaces.length);
    this._loadedFontKeys.clear();
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
