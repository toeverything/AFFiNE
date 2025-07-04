import { CodeBlockPreviewExtension } from '@blocksuite/affine/blocks/code';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import type { CodeBlockModel } from '@blocksuite/affine/model';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { choose } from 'lit/directives/choose.js';
import { styleMap } from 'lit/directives/style-map.js';

import { linkIframe } from './iframe-container';

export const CodeBlockHtmlPreview = CodeBlockPreviewExtension(
  'html',
  model => html`<html-preview .model=${model}></html-preview>`
);

export class HTMLPreview extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .html-preview-loading {
      color: ${unsafeCSSVarV2('text/placeholder')};
      font-feature-settings:
        'liga' off,
        'clig' off;

      /* light/code/base */
      font-family: 'IBM Plex Mono';
      font-size: 12px;
      font-style: normal;
      font-weight: 400;
      line-height: normal;
    }

    .html-preview-error,
    .html-preview-fallback {
      color: ${unsafeCSSVarV2('button/error')};
      font-feature-settings:
        'liga' off,
        'clig' off;

      /* light/code/base */
      font-family: 'IBM Plex Mono';
      font-size: 12px;
      font-style: normal;
      font-weight: 400;
      line-height: normal;
    }

    .html-preview-iframe {
      width: 100%;
      height: 544px;
      border: none;
    }
  `;

  @property({ attribute: false })
  accessor model: CodeBlockModel | null = null;

  @property({ attribute: false })
  accessor html: string | null = null;

  @state()
  accessor state: 'loading' | 'error' | 'finish' | 'fallback' = 'loading';

  @query('iframe')
  accessor iframe!: HTMLIFrameElement;

  override firstUpdated(_changedProperties: PropertyValues): void {
    const result = super.firstUpdated(_changedProperties);

    this._link();

    if (this.model) {
      this.disposables.add(
        this.model.props.text$.subscribe(() => {
          this._link();
        })
      );
    }

    return result;
  }

  override updated(changedProperties: PropertyValues): void {
    const result = super.updated(changedProperties);
    if (changedProperties.has('html')) {
      this._link();
    }
    return result;
  }

  get normalizedHtml() {
    return this.model?.props.text.toString() ?? this.html;
  }

  private _link() {
    this.state = 'loading';

    if (!this.normalizedHtml) {
      this.state = 'fallback';
      return;
    }

    try {
      linkIframe(this.iframe, this.normalizedHtml);
      this.state = 'finish';
    } catch (error) {
      console.error('HTML preview iframe failed:', error);
      this.state = 'error';
    }
  }

  override render() {
    return html`
      <div class="html-preview-container">
        ${choose(this.state, [
          [
            'loading',
            () =>
              html`<div class="html-preview-loading">
                Rendering the code...
              </div>`,
          ],
          [
            'error',
            () =>
              html`<div class="html-preview-error">
                Failed to render the preview. Please check your HTML code for
                errors.
              </div>`,
          ],
          [
            'fallback',
            () =>
              html`<div class="html-preview-fallback">
                This feature is not supported in your browser. Please download
                the AFFiNE Desktop App to use it.
              </div>`,
          ],
        ])}
        <iframe
          class="html-preview-iframe"
          title="HTML Preview"
          style=${styleMap({
            display: this.state === 'finish' ? undefined : 'none',
          })}
        ></iframe>
      </div>
    `;
  }
}

export function effects() {
  customElements.define('html-preview', HTMLPreview);
}

declare global {
  interface HTMLElementTagNameMap {
    'html-preview': HTMLPreview;
  }
}
