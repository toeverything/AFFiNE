import { getDocTitleByEditorHost } from '@blocksuite/affine-fragment-doc-title';
import type { RootBlockModel } from '@blocksuite/affine-model';
import {
  FeatureFlagService,
  isVirtualKeyboardProviderWithAction,
  VirtualKeyboardProvider,
  type VirtualKeyboardProviderWithAction,
} from '@blocksuite/affine-shared/services';
import { IS_MOBILE } from '@blocksuite/global/env';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/std';
import { effect, signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { literal, unsafeStatic } from 'lit/static-html.js';

import {
  defaultKeyboardToolbarConfig,
  KeyboardToolbarConfigExtension,
} from './config.js';
import { isRootComponentActive } from './utils.js';

export const AFFINE_KEYBOARD_TOOLBAR_WIDGET = 'affine-keyboard-toolbar-widget';

export class AffineKeyboardToolbarWidget extends WidgetComponent<RootBlockModel> {
  private readonly _show$ = signal(false);

  private _initialInputMode: string = '';

  // keyboard-toolbar-panel-expand-bug (part 3): `inputMode = 'none'` alone
  // does not dismiss an *already-visible* iOS keyboard -- WebKit only
  // consults `inputMode` at the moment an element gains focus, not while
  // it's already focused. Confirmed directly on-device (mobile-debug-eval):
  // blurring `document.activeElement` while the keyboard is up reliably
  // dismisses it (visualViewport.height jumped from 362 -> 628 immediately),
  // while toggling `inputMode` with focus untouched does nothing visible.
  // So `hide()` blurs (deferred, see below) in addition to setting
  // `inputMode`, and `show()` refocuses the same element to bring the
  // keyboard back, preserving cursor position.
  private _blurredActiveElement: HTMLElement | null = null;

  get keyboard(): VirtualKeyboardProviderWithAction & { fallback?: boolean } {
    const provider = this.std.get(VirtualKeyboardProvider);
    if (isVirtualKeyboardProviderWithAction(provider)) return provider;

    return {
      // fallback keyboard actions
      fallback: true,
      show: () => {
        const rootComponent = this.block?.rootComponent;
        const isActive = isRootComponentActive(
          rootComponent,
          document.activeElement
        );
        const inputModeBefore = rootComponent?.inputMode;
        if (isActive && rootComponent) {
          rootComponent.inputMode = this._initialInputMode;
        }
        if (this._blurredActiveElement) {
          const toFocus = this._blurredActiveElement;
          this._blurredActiveElement = null;
          toFocus.focus();
        }
        console.debug('[MobileDebugLog] keyboard-toolbar-inputmode-toggle', {
          timestampMs: Date.now(),
          action: 'show',
          isActiveElement: !!isActive,
          inputModeBefore,
          inputModeAfter: isActive ? this._initialInputMode : inputModeBefore,
        });
      },
      hide: () => {
        const rootComponent = this.block?.rootComponent;
        const isActive = isRootComponentActive(
          rootComponent,
          document.activeElement
        );
        const inputModeBefore = rootComponent?.inputMode;
        if (isActive && rootComponent) {
          rootComponent.inputMode = 'none';
        }
        // Deferred to a macrotask: blurring synchronously inside the same
        // prevented pointerdown/click gesture that triggered this `hide()`
        // updates `document.activeElement` correctly, but iOS Safari does
        // not play the native keyboard-dismiss animation for it -- it isn't
        // recognized as a "real" user-initiated blur inside an already
        // `preventDefault()`-ed gesture. Escaping to a macrotask runs it
        // outside that gesture entirely, which iOS does recognize.
        const active = document.activeElement;
        if (isActive && active instanceof HTMLElement) {
          this._blurredActiveElement = active;
          setTimeout(() => active.blur(), 0);
        }
        console.debug('[MobileDebugLog] keyboard-toolbar-inputmode-toggle', {
          timestampMs: Date.now(),
          action: 'hide',
          isActiveElement: !!isActive,
          inputModeBefore,
          inputModeAfter: isActive ? 'none' : inputModeBefore,
        });
      },
      ...provider,
    };
  }

  private get _docTitle() {
    return getDocTitleByEditorHost(this.std.host);
  }

  get config() {
    return {
      ...defaultKeyboardToolbarConfig,
      ...this.std.getOptional(KeyboardToolbarConfigExtension.identifier),
    };
  }

  override connectedCallback(): void {
    super.connectedCallback();

    this.disposables.add(
      effect(() => {
        this._show$.value = this.std.event.active$.value;
      })
    );

    const rootComponent = this.block?.rootComponent;
    if (rootComponent && this.keyboard.fallback) {
      this._initialInputMode = rootComponent.inputMode;
      this.disposables.add(() => {
        rootComponent.inputMode = this._initialInputMode;
      });
      this.disposables.add(
        effect(() => {
          // recover input mode when keyboard toolbar is hidden
          if (!this._show$.value) {
            rootComponent.inputMode = this._initialInputMode;
          }
        })
      );
    }

    if (this._docTitle) {
      const { inlineEditorContainer } = this._docTitle;
      this.disposables.addFromEvent(inlineEditorContainer, 'focus', () => {
        this._show$.value = true;
      });
      this.disposables.addFromEvent(inlineEditorContainer, 'blur', () => {
        this._show$.value = false;
      });
    }
  }

  override render() {
    if (
      this.store.readonly ||
      !IS_MOBILE ||
      !this.store
        .get(FeatureFlagService)
        .getFlag('enable_mobile_keyboard_toolbar')
    )
      return nothing;

    if (!this._show$.value) return nothing;

    if (!this.block?.rootComponent) return nothing;

    return html`<blocksuite-portal
      .shadowDom=${false}
      .template=${html`<affine-keyboard-toolbar
        .keyboard=${this.keyboard}
        .config=${this.config}
        .rootComponent=${this.block.rootComponent}
      ></affine-keyboard-toolbar>`}
    ></blocksuite-portal>`;
  }
}

export const keyboardToolbarWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_KEYBOARD_TOOLBAR_WIDGET,
  literal`${unsafeStatic(AFFINE_KEYBOARD_TOOLBAR_WIDGET)}`
);

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_KEYBOARD_TOOLBAR_WIDGET]: AffineKeyboardToolbarWidget;
  }
}
