import { ArrowRightIcon, EnterIcon } from '@blocksuite/affine/components/icons';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { ColorScheme } from '@blocksuite/affine/model';
import {
  EditorHost,
  PropTypes,
  requiredProperties,
} from '@blocksuite/affine/std';
import { css, html, LitElement, nothing } from 'lit';
import { property, query } from 'lit/decorators.js';

import { menuItemStyles } from './styles';
import type { AIItemConfig } from './types';

@requiredProperties({
  host: PropTypes.instanceOf(EditorHost),
  item: PropTypes.object,
})
export class AIItem extends WithDisposable(LitElement) {
  static override styles = css`
    ${menuItemStyles}
  `;

  override render() {
    const { item } = this;
    const className = item.name.split(' ').join('-').toLocaleLowerCase();
    const testId = item.testId;

    return html`<div
      data-testid=${testId}
      data-app-theme=${this.theme}
      class="menu-item ${className}"
      @pointerdown=${(e: MouseEvent) => e.stopPropagation()}
      @click=${() => {
        this.onClick?.();
        if (typeof item.handler === 'function') {
          item.handler(this.host);
        }
      }}
    >
      <span class="item-icon">${item.icon}</span>
      <div class="item-name">
        ${item.name}${item.beta
          ? html`<div class="item-beta">(Beta)</div>`
          : nothing}
      </div>
      ${item.subItem
        ? html`<span class="arrow-right-icon">${ArrowRightIcon}</span>`
        : html`<span class="enter-icon">${EnterIcon}</span>`}
    </div>`;
  }

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor item!: AIItemConfig;

  @query('.menu-item')
  accessor menuItem: HTMLDivElement | null = null;

  @property({ attribute: false })
  accessor onClick: (() => void) | undefined;

  @property({ attribute: false })
  accessor theme: ColorScheme = ColorScheme.Light;
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-item': AIItem;
  }
}
