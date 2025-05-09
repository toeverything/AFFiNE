import { CodeBlockPreviewExtension } from '@blocksuite/affine/blocks/code';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import type { CodeBlockModel } from '@blocksuite/affine/model';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { css, html, LitElement, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { choose } from 'lit/directives/choose.js';
import { styleMap } from 'lit/directives/style-map.js';

import { linkWebContainer } from './web-container';

export const CodeBlockHtmlPreview = CodeBlockPreviewExtension(
  'html',
  model => html`<html-preview .model=${model}></html-preview>`
);

export class HTMLPreview extends SignalWatcher(WithDisposable(LitElement)) {
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

    .html-preview-error {
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
  `;

  @property({ attribute: false })
  accessor model!: CodeBlockModel;

  @state()
  accessor state: 'loading' | 'error' | 'finish' = 'loading';

  @query('iframe')
  accessor iframe!: HTMLIFrameElement;

  override firstUpdated(_changedProperties: PropertyValues): void {
    const result = super.firstUpdated(_changedProperties);

    this._link();

    this.disposables.add(
      this.model.props.text$.subscribe(() => {
        this._link();
      })
    );

    return result;
  }

  private _link() {
    this.state = 'loading';
    linkWebContainer(this.iframe, this.model)
      .then(() => {
        this.state = 'finish';
      })
      .catch(error => {
        console.error('Failed to link WebContainer:', error);
        this.state = 'error';
      });
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
