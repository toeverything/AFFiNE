import { LoadingIcon } from '@blocksuite/affine/components/icons';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVar } from '@blocksuite/affine/shared/theme';
import { baseTheme } from '@toeverything/theme';
import {
  css,
  html,
  LitElement,
  nothing,
  type PropertyValues,
  unsafeCSS,
} from 'lit';
import { property } from 'lit/decorators.js';

export class GeneratingPlaceholder extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      margin-bottom: 8px;
    }

    .generating-header {
      width: 100%;
      font-size: ${unsafeCSSVar('fontXs')};
      font-style: normal;
      font-weight: 500;
      line-height: 20px;
      height: 20px;
    }

    .generating-header,
    .loading-progress {
      color: ${unsafeCSSVar('textSecondaryColor')};
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
    }

    .generating-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: 100%;
      border-radius: 4px;
      border: 2px solid ${unsafeCSSVar('primaryColor')};
      background: ${unsafeCSSVar('blue50')};
      color: ${unsafeCSSVar('brandColor')};
      gap: 4px;
    }

    .generating-icon {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 24px;
    }

    .generating-icon svg {
      scale: 1.5;
    }

    .loading-progress {
      display: flex;
      flex-direction: column;
      font-style: normal;
      font-weight: 400;
      text-align: center;
      gap: 4px;
    }

    .loading-text {
      font-size: ${unsafeCSSVar('fontBase')};
      height: 24px;
      line-height: 24px;
    }

    .loading-stage {
      font-size: ${unsafeCSSVar('fontXs')};
      height: 20px;
      line-height: 20px;
    }
  `;

  protected override render() {
    const loadingText = this.stages[this.loadingProgress - 1] || '';

    return html`<style>
        .generating-body {
          height: ${this.height}px;
        }
      </style>
      ${this.showHeader
        ? html`<div class="generating-header">Answer</div>`
        : nothing}
      <div class="generating-body">
        <div class="generating-icon">${LoadingIcon()}</div>
        <div class="loading-progress">
          <div class="loading-text">${loadingText}</div>
          <div class="loading-stage">
            ${this.loadingProgress} / ${this.stages.length}
          </div>
        </div>
      </div>`;
  }

  override willUpdate(changed: PropertyValues) {
    if (changed.has('loadingProgress')) {
      this.loadingProgress = Math.max(
        1,
        Math.min(this.loadingProgress, this.stages.length)
      );
    }
  }

  @property({ attribute: false })
  accessor height: number = 300;

  @property({ attribute: false })
  accessor loadingProgress!: number;

  @property({ attribute: false })
  accessor showHeader!: boolean;

  @property({ attribute: false })
  accessor stages!: string[];
}

declare global {
  interface HTMLElementTagNameMap {
    'generating-placeholder': GeneratingPlaceholder;
  }
}
