import { EnterIcon } from '@blocksuite/affine/components/icons';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { stopPropagation } from '@blocksuite/affine/shared/utils';
import {
  EditorHost,
  PropTypes,
  requiredProperties,
} from '@blocksuite/affine/std';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, nothing, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { menuItemStyles } from './styles';
import type { AIItemConfig, AISubItemConfig } from './types';

@requiredProperties({
  host: PropTypes.instanceOf(EditorHost),
  item: PropTypes.object,
})
export class AISubItemList extends WithDisposable(LitElement) {
  static override styles = css`
    .ai-sub-menu {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      padding: 8px;
      min-width: 240px;
      max-height: 320px;
      overflow-y: auto;
      background: var(--affine-background-overlay-panel-color);
      box-shadow: var(--affine-shadow-2);
      border-radius: 8px;
      z-index: var(--affine-z-index-popover);
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
      color: var(--affine-text-primary-color);
      text-align: justify;
      font-feature-settings:
        'clig' off,
        'liga' off;
      font-size: var(--affine-font-sm);
      font-style: normal;
      font-weight: 400;
      line-height: 22px;
      user-select: none;
    }
    ${menuItemStyles}
  `;

  private readonly _handleClick = (subItem: AISubItemConfig) => {
    this.onClick?.();
    if (subItem.handler) {
      // TODO: add parameters to ai handler
      subItem.handler(this.host);
    }
    this.abortController.abort();
  };

  override connectedCallback() {
    super.connectedCallback();

    this.disposables.addFromEvent(this, 'pointerdown', stopPropagation);
  }

  override render() {
    if (!this.item.subItem || this.item.subItem.length <= 0) return nothing;
    return html`<div class="ai-sub-menu">
      ${repeat(
        this.item.subItem,
        subItem => subItem.type,
        subItem =>
          html`<div
            data-testid=${subItem.testId}
            class="menu-item"
            @click=${() => this._handleClick(subItem)}
          >
            <div class="item-name">${subItem.type}</div>
            <span class="enter-icon">${EnterIcon}</span>
          </div>`
      )}
    </div>`;
  }

  @property({ attribute: false })
  accessor abortController: AbortController = new AbortController();

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor item!: AIItemConfig;

  @property({ attribute: false })
  accessor onClick: (() => void) | undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-sub-item-list': AISubItemList;
  }
}
