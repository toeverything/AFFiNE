import { AIStarIcon } from '@blocksuite/affine/components/icons';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { ColorScheme } from '@blocksuite/affine/model';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { stopPropagation } from '@blocksuite/affine/shared/utils';
import { SendIcon } from '@blocksuite/icons/lit';
import {
  darkCssVariablesV2,
  lightCssVariablesV2,
} from '@toeverything/theme/v2';
import { css, html, LitElement, nothing, unsafeCSS } from 'lit';
import { property, query, state } from 'lit/decorators.js';

export class AIPanelInput extends SignalWatcher(WithDisposable(LitElement)) {
  static override styles = css`
    :host {
      width: 100%;
      padding: 0 12px;
      box-sizing: border-box;
    }

    .root {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .star {
      display: flex;
      padding: 2px;
      align-items: center;
    }

    .textarea-container {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      flex: 1 0 0;

      textarea {
        flex: 1 0 0;
        border: none;
        outline: none;
        -webkit-box-shadow: none;
        -moz-box-shadow: none;
        box-shadow: none;
        background-color: transparent;
        resize: none;
        overflow: hidden;
        padding: 0px;

        color: ${unsafeCSSVarV2('text/primary')};

        /* light/sm */
        font-family: var(--affine-font-family);
        font-size: var(--affine-font-sm);
        font-style: normal;
        font-weight: 400;
        line-height: 22px; /* 157.143% */
      }

      textarea::placeholder {
        color: ${unsafeCSSVarV2('text/placeholder')};
      }

      textarea::-moz-placeholder {
        color: ${unsafeCSSVarV2('text/placeholder')};
      }
    }

    .arrow {
      display: flex;
      align-items: center;
      padding: 2px;
      gap: 4px;
      border-radius: 4px;
      background: ${unsafeCSSVarV2('icon/disable')};
      svg {
        width: 20px;
        height: 20px;
        color: ${unsafeCSSVarV2('button/pureWhiteText')};
      }
    }

    .arrow[data-active='true'] {
      background: ${unsafeCSSVarV2('icon/activated')};
    }

    .arrow[data-active='true']:hover {
      cursor: pointer;
    }

    .network {
      display: flex;
      align-items: center;
      padding: 2px;
      gap: 4px;
      cursor: pointer;
      svg {
        width: 20px;
        height: 20px;
        color: ${unsafeCSSVarV2('icon/primary')};
      }
    }

    .network[data-active='true'] svg {
      color: ${unsafeCSSVarV2('icon/activated')};
    }

    :host([data-app-theme='light']) {
      .network svg {
        color: ${unsafeCSS(lightCssVariablesV2['--affine-v2-icon-primary'])};
      }

      .network[data-active='true'] svg {
        color: ${unsafeCSS(lightCssVariablesV2['--affine-v2-icon-activated'])};
      }

      textarea {
        color: ${unsafeCSS(lightCssVariablesV2['--affine-v2-text-primary'])};
      }

      textarea::placeholder {
        color: ${unsafeCSS(
          lightCssVariablesV2['--affine-v2-text-placeholder']
        )};
      }

      textarea::-moz-placeholder {
        color: ${unsafeCSS(
          lightCssVariablesV2['--affine-v2-text-placeholder']
        )};
      }

      .arrow {
        background: ${unsafeCSS(
          lightCssVariablesV2['--affine-v2-icon-disable']
        )};
      }

      .arrow[data-active='true'] {
        background: ${unsafeCSS(
          lightCssVariablesV2['--affine-v2-icon-activated']
        )};
      }

      .arrow svg {
        color: ${unsafeCSS(lightCssVariablesV2['--affine-v2-pure-white-text'])};
      }
    }

    :host([data-app-theme='dark']) {
      .network svg {
        color: ${unsafeCSS(darkCssVariablesV2['--affine-v2-icon-primary'])};
      }

      .network[data-active='true'] svg {
        color: ${unsafeCSS(darkCssVariablesV2['--affine-v2-icon-activated'])};
      }

      textarea {
        color: ${unsafeCSS(darkCssVariablesV2['--affine-v2-text-primary'])};
      }

      textarea::placeholder {
        color: ${unsafeCSS(darkCssVariablesV2['--affine-v2-text-placeholder'])};
      }

      textarea::-moz-placeholder {
        color: ${unsafeCSS(darkCssVariablesV2['--affine-v2-text-placeholder'])};
      }

      .arrow {
        background: ${unsafeCSS(
          darkCssVariablesV2['--affine-v2-icon-disable']
        )};
      }

      .arrow[data-active='true'] {
        background: ${unsafeCSS(
          darkCssVariablesV2['--affine-v2-icon-activated']
        )};
      }

      .arrow svg {
        color: ${unsafeCSS(darkCssVariablesV2['--affine-v2-pure-white-text'])};
      }
    }
  `;

  private readonly _onInput = () => {
    this.textarea.style.height = 'auto';
    this.textarea.style.height = this.textarea.scrollHeight + 'px';

    this.onInput?.(this.textarea.value);
    const value = this.textarea.value.trim();
    this._hasContent = value.length > 0;
    this._arrow.dataset.active = String(this._hasContent);
  };

  private readonly _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      this._sendToAI(e);
    }
  };

  private readonly _sendToAI = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const value = this.textarea.value.trim();
    if (value.length === 0) return;

    this.onFinish?.(value);
    this.remove();
  };

  override render() {
    return html`<div class="root">
      <div class="star">${AIStarIcon}</div>
      <div class="textarea-container">
        <textarea
          placeholder="What are your thoughts?"
          rows="1"
          @keydown=${this._onKeyDown}
          @input=${this._onInput}
          @pointerdown=${stopPropagation}
          @click=${stopPropagation}
          @dblclick=${stopPropagation}
          @cut=${stopPropagation}
          @copy=${stopPropagation}
          @paste=${stopPropagation}
          @keyup=${stopPropagation}
        ></textarea>
        <div
          class="arrow"
          data-testid="ai-panel-input-send"
          @click=${this._sendToAI}
          @pointerdown=${stopPropagation}
        >
          ${SendIcon()}
          ${this._hasContent
            ? html`<affine-tooltip .offsetY=${12}>Send to AI</affine-tooltip>`
            : nothing}
        </div>
      </div>
    </div>`;
  }

  override updated(_changedProperties: Map<PropertyKey, unknown>): void {
    const result = super.updated(_changedProperties);
    this.textarea.style.height = this.textarea.scrollHeight + 'px';
    return result;
  }

  @query('.arrow')
  private accessor _arrow!: HTMLDivElement;

  @state()
  private accessor _hasContent = false;

  @property({ attribute: false })
  accessor onFinish: ((input: string) => void) | undefined = undefined;

  @property({ attribute: false })
  accessor onInput: ((input: string) => void) | undefined = undefined;

  @property({ attribute: 'data-app-theme', reflect: true })
  accessor theme: ColorScheme = ColorScheme.Light;

  @query('textarea')
  accessor textarea!: HTMLTextAreaElement;
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-panel-input': AIPanelInput;
  }
}
