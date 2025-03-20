import { getDocTitleByEditorHost } from '@blocksuite/affine-fragment-doc-title';
import type { RootBlockModel } from '@blocksuite/affine-model';
import { FeatureFlagService } from '@blocksuite/affine-shared/services';
import { WidgetComponent } from '@blocksuite/block-std';
import { IS_MOBILE } from '@blocksuite/global/env';
import { signal } from '@preact/signals-core';
import { html, nothing } from 'lit';

import type { PageRootBlockComponent } from '../../page/page-root-block.js';
import { RootBlockConfigExtension } from '../../root-config.js';
import { defaultKeyboardToolbarConfig } from './config.js';

export * from './config.js';

export const AFFINE_KEYBOARD_TOOLBAR_WIDGET = 'affine-keyboard-toolbar-widget';

export class AffineKeyboardToolbarWidget extends WidgetComponent<
  RootBlockModel,
  PageRootBlockComponent
> {
  private readonly _close = (blur: boolean) => {
    if (blur) {
      if (document.activeElement === this._docTitle?.inlineEditorContainer) {
        this._docTitle?.inlineEditor?.setInlineRange(null);
      } else if (document.activeElement === this.block?.rootComponent) {
        this.std.selection.clear();
      }
    }
    this._show$.value = false;
  };

  private readonly _show$ = signal(false);

  private get _docTitle() {
    return getDocTitleByEditorHost(this.std.host);
  }

  get config() {
    return {
      ...defaultKeyboardToolbarConfig,
      ...this.std.getOptional(RootBlockConfigExtension.identifier)
        ?.keyboardToolbar,
    };
  }

  override connectedCallback(): void {
    super.connectedCallback();

    const rootComponent = this.block?.rootComponent;
    if (rootComponent) {
      this.disposables.addFromEvent(rootComponent, 'focus', () => {
        this._show$.value = true;
      });
      this.disposables.addFromEvent(rootComponent, 'blur', () => {
        this._show$.value = false;
      });
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
      this.doc.readonly ||
      !IS_MOBILE ||
      !this.doc
        .get(FeatureFlagService)
        .getFlag('enable_mobile_keyboard_toolbar')
    )
      return nothing;

    if (!this._show$.value) return nothing;

    if (!this.block?.rootComponent) return nothing;

    return html`<blocksuite-portal
      .shadowDom=${false}
      .template=${html`<affine-keyboard-toolbar
        .config=${this.config}
        .rootComponent=${this.block.rootComponent}
        .close=${this._close}
      ></affine-keyboard-toolbar> `}
    ></blocksuite-portal>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_KEYBOARD_TOOLBAR_WIDGET]: AffineKeyboardToolbarWidget;
  }
}
