import type { MenuItemGroup } from '@blocksuite/affine-components/toolbar';
import { renderGroups } from '@blocksuite/affine-components/toolbar';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { CodeBlockToolbarContext } from '../context.js';

export class AffineCodeMoreMenu extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  override firstUpdated() {
    this.disposables.add(
      this.context.blockComponent.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'wrap' || key === 'lineNumber') {
          this.requestUpdate();
        }
      })
    );
  }

  override render() {
    return html`
      <editor-menu-content
        data-show
        class="more-popup-menu"
        style=${styleMap({
          '--content-padding': '8px',
          '--packed-height': '4px',
        })}
      >
        <div data-size="large" data-orientation="vertical">
          ${renderGroups(this.moreGroups, this.context)}
        </div>
      </editor-menu-content>
    `;
  }

  @property({ attribute: false })
  accessor context!: CodeBlockToolbarContext;

  @property({ attribute: false })
  accessor moreGroups!: MenuItemGroup<CodeBlockToolbarContext>[];
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-code-more-menu': AffineCodeMoreMenu;
  }
}
