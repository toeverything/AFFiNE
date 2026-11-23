import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  PropTypes,
  requiredProperties,
  ShadowlessElement,
} from '@blocksuite/std';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import type {
  KeyboardIconType,
  KeyboardToolbarActionItem,
  KeyboardToolbarContext,
  KeyboardToolPanelConfig,
  KeyboardToolPanelGroup,
} from './config.js';
import { keyboardToolPanelStyles } from './styles.js';

export const AFFINE_KEYBOARD_TOOL_PANEL = 'affine-keyboard-tool-panel';

@requiredProperties({
  context: PropTypes.object,
})
export class AffineKeyboardToolPanel extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = keyboardToolPanelStyles;

  private readonly _handleItemClick = (item: KeyboardToolbarActionItem) => {
    if (item.disableWhen && item.disableWhen(this.context)) return;
    if (item.action) {
      Promise.resolve(item.action(this.context)).catch(console.error);
    }
  };

  private _renderGroup(group: KeyboardToolPanelGroup) {
    const items = group.items.filter(
      item => item.showWhen?.(this.context) ?? true
    );

    return html`<div class="keyboard-tool-panel-group">
      <div class="keyboard-tool-panel-group-header">${group.name}</div>
      <div class="keyboard-tool-panel-group-item-container">
        ${repeat(
          items,
          item => item.name,
          item => this._renderItem(item)
        )}
      </div>
    </div>`;
  }

  private _renderIcon(icon: KeyboardIconType) {
    return typeof icon === 'function' ? icon(this.context) : icon;
  }

  private _renderItem(item: KeyboardToolbarActionItem) {
    return html`<div class="keyboard-tool-panel-item">
      <button @click=${() => this._handleItemClick(item)}>
        ${this._renderIcon(item.icon)}
      </button>
      <span>${item.name}</span>
    </div>`;
  }

  override render() {
    if (!this.config) return nothing;

    const groups = this.config.groups
      .map(group => (typeof group === 'function' ? group(this.context) : group))
      .filter((group): group is KeyboardToolPanelGroup => group !== null);

    return html`<div class="affine-keyboard-tool-panel-container">
      ${repeat(
        groups,
        group => group.name,
        group => this._renderGroup(group)
      )}
    </div>`;
  }

  @property({ attribute: false })
  accessor config: KeyboardToolPanelConfig | null = null;

  @property({ attribute: false })
  accessor context!: KeyboardToolbarContext;
}
