import { ColorScheme } from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { LifeCycleWatcher } from '@blocksuite/std';
import { type Signal, signal } from '@preact/signals-core';
import {
  createHighlighterCore,
  createOnigurumaEngine,
  type HighlighterCore,
  type MaybeGetter,
} from 'shiki';
import getWasm from 'shiki/wasm';

import { CodeBlockConfigExtension } from './code-block-config.js';
import {
  CODE_BLOCK_DEFAULT_DARK_THEME,
  CODE_BLOCK_DEFAULT_LIGHT_THEME,
} from './highlight/const.js';

export class CodeBlockHighlighter extends LifeCycleWatcher {
  static override key = 'code-block-highlighter';

  // Singleton highlighter instance
  private static _sharedHighlighter: HighlighterCore | null = null;
  private static _highlighterPromise: Promise<HighlighterCore> | null = null;
  private static _refCount = 0;
  private static _disposeTimer: ReturnType<typeof setTimeout> | null = null;

  private _darkThemeKey: string | undefined;
  private _lightThemeKey: string | undefined;

  highlighter$: Signal<HighlighterCore | null> = signal(null);

  get themeKey() {
    const theme = this.std.get(ThemeProvider).theme$.value;
    return theme === ColorScheme.Dark
      ? this._darkThemeKey
      : this._lightThemeKey;
  }

  private readonly _loadTheme = async (
    highlighter: HighlighterCore
  ): Promise<void> => {
    // It is possible that by the time the highlighter is ready all instances
    // have already been unmounted. In that case there is no need to load
    // themes or update state.
    if (
      CodeBlockHighlighter._refCount === 0 ||
      highlighter !== CodeBlockHighlighter._sharedHighlighter
    ) {
      return;
    }

    const config = this.std.getOptional(CodeBlockConfigExtension.identifier);
    const darkTheme = config?.theme?.dark ?? CODE_BLOCK_DEFAULT_DARK_THEME;
    const lightTheme = config?.theme?.light ?? CODE_BLOCK_DEFAULT_LIGHT_THEME;
    this._darkThemeKey = (await normalizeGetter(darkTheme)).name;
    this._lightThemeKey = (await normalizeGetter(lightTheme)).name;
    if (
      CodeBlockHighlighter._refCount === 0 ||
      highlighter !== CodeBlockHighlighter._sharedHighlighter
    ) {
      return;
    }

    try {
      await highlighter.loadTheme(darkTheme, lightTheme);
    } catch (error) {
      // During fast unmount/remount cycles, an outdated async callback can race
      // with disposal of a previous singleton. Ignore this stale callback.
      if (highlighter !== CodeBlockHighlighter._sharedHighlighter) {
        return;
      }
      throw error;
    }
    this.highlighter$.value = highlighter;
  };

  private static async _getOrCreateHighlighter(): Promise<HighlighterCore> {
    if (CodeBlockHighlighter._sharedHighlighter) {
      return CodeBlockHighlighter._sharedHighlighter;
    }

    if (!CodeBlockHighlighter._highlighterPromise) {
      CodeBlockHighlighter._highlighterPromise = createHighlighterCore({
        engine: createOnigurumaEngine(() => getWasm),
      }).then(highlighter => {
        CodeBlockHighlighter._sharedHighlighter = highlighter;
        return highlighter;
      });
    }

    return CodeBlockHighlighter._highlighterPromise;
  }

  override mounted(): void {
    super.mounted();

    if (CodeBlockHighlighter._disposeTimer) {
      clearTimeout(CodeBlockHighlighter._disposeTimer);
      CodeBlockHighlighter._disposeTimer = null;
    }

    CodeBlockHighlighter._refCount++;

    CodeBlockHighlighter._getOrCreateHighlighter()
      .then(this._loadTheme)
      .catch(console.error);
  }

  override unmounted(): void {
    CodeBlockHighlighter._refCount = Math.max(
      CodeBlockHighlighter._refCount - 1,
      0
    );
    this.highlighter$.value = null;

    // Dispose the shared highlighter **after** any in-flight creation finishes.
    if (CodeBlockHighlighter._refCount !== 0) {
      return;
    }

    const doDispose = (highlighter: HighlighterCore | null) => {
      if (highlighter) {
        highlighter.dispose();
      }
      CodeBlockHighlighter._sharedHighlighter = null;
      CodeBlockHighlighter._highlighterPromise = null;
    };

    // Defer disposal to absorb fast mount/unmount churn in e2e and avoid
    // disposing while async theme loading callbacks are still in flight.
    CodeBlockHighlighter._disposeTimer = setTimeout(() => {
      CodeBlockHighlighter._disposeTimer = null;
      if (CodeBlockHighlighter._refCount !== 0) {
        return;
      }

      if (CodeBlockHighlighter._sharedHighlighter) {
        // Highlighter already created – dispose immediately.
        doDispose(CodeBlockHighlighter._sharedHighlighter);
      } else if (CodeBlockHighlighter._highlighterPromise) {
        // Highlighter still being created – wait for it, then dispose.
        CodeBlockHighlighter._highlighterPromise
          .then(created => {
            if (CodeBlockHighlighter._refCount === 0) {
              doDispose(created);
            }
          })
          .catch(console.error);
      }
    }, 100);
  }
}

/**
 * https://github.com/shikijs/shiki/blob/933415cdc154fe74ccfb6bbb3eb6a7b7bf183e60/packages/core/src/internal.ts#L31
 */
export async function normalizeGetter<T>(p: MaybeGetter<T>): Promise<T> {
  return Promise.resolve(typeof p === 'function' ? (p as any)() : p).then(
    r => r.default || r
  );
}
