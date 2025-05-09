import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

export class Button extends SignalWatcher(WithDisposable(ShadowlessElement)) {
  static override styles = css`
    data-view-component-button {
      border-radius: 4px;
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      display: flex;
      padding: 4px 8px;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      font-weight: 400;
      line-height: 22px;
      color: ${unsafeCSSVarV2('text/primary')};
      cursor: pointer;
      transition:
        color 0.2s,
        background-color 0.2s,
        border-color 0.2s;
      white-space: nowrap;
    }

    data-view-component-button.border:hover,
    data-view-component-button.border.active {
      color: ${unsafeCSSVarV2('text/emphasis')};
      border-color: ${unsafeCSSVarV2('icon/activated')};
    }

    data-view-component-button.background:hover,
    data-view-component-button.background.active {
      background-color: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
    }

    .button-icon {
      font-size: 16px;
      display: flex;
      align-items: center;
      transition: color 0.2s;
      color: ${unsafeCSSVarV2('icon/primary')};
    }

    data-view-component-button.border:hover .button-icon,
    data-view-component-button.border.active .button-icon {
      color: ${unsafeCSSVarV2('icon/activated')};
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(this.hoverType);
    if (this.onClick) {
      this.disposables.addFromEvent(this, 'click', this.onClick);
    }
  }

  override render() {
    return html`
      <div class="button-icon">${this.icon}</div>
      ${this.text}
      <div class="button-icon">${this.postfix}</div>
    `;
  }

  @property()
  accessor hoverType: 'background' | 'border' = 'background';

  @property({ attribute: false })
  accessor icon: TemplateResult | undefined;

  @property({ attribute: false })
  accessor onClick: ((event: MouseEvent) => void) | undefined;

  @property({ attribute: false })
  accessor postfix: TemplateResult | string | undefined;

  @property({ attribute: false })
  accessor text: TemplateResult | string | undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'data-view-component-button': Button;
  }
}
