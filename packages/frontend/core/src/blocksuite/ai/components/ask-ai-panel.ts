import { WithDisposable } from '@blocksuite/affine/global/lit';
import {
  DocModeProvider,
  ThemeProvider,
} from '@blocksuite/affine/shared/services';
import { scrollbarStyle } from '@blocksuite/affine/shared/styles';
import { type EditorHost } from '@blocksuite/affine/std';
import { cssVar } from '@toeverything/theme';
import { css, html, LitElement, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { AIItemGroupConfig } from './ai-item/types';

export class AskAIPanel extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      position: relative;
    }

    .ask-ai-panel {
      box-sizing: border-box;
      padding: 8px 4px 8px 8px;
      max-height: 374px;
      overflow-y: auto;
      background: var(--affine-background-overlay-panel-color);
      box-shadow: ${unsafeCSS(cssVar('overlayPanelShadow'))};
      border-radius: 8px;
      z-index: var(--affine-z-index-popover);
      scrollbar-gutter: stable;
    }

    ${scrollbarStyle('.ask-ai-panel')}
    .ask-ai-panel:hover::-webkit-scrollbar-thumb {
      background-color: var(--affine-black-30);
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor actionGroups!: AIItemGroupConfig[];

  @property({ attribute: false })
  accessor abortController: AbortController | null = null;

  @property({ attribute: false })
  accessor onItemClick: (() => void) | undefined = undefined;

  @property({ attribute: false })
  accessor minWidth = 330;

  get _isEdgelessMode() {
    return this.host.std.get(DocModeProvider).getEditorMode() === 'edgeless';
  }

  get _actionGroups() {
    const filteredConfig = this.actionGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item =>
          item.showWhen
            ? item.showWhen(
                this.host.command.chain(),
                this._isEdgelessMode ? 'edgeless' : 'page',
                this.host
              )
            : true
        ),
      }))
      .filter(group => group.items.length > 0);
    return filteredConfig;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.add(
      this.host.std.get(ThemeProvider).app$.subscribe(() => {
        this.requestUpdate();
      })
    );
  }

  override render() {
    const style = styleMap({
      minWidth: `${this.minWidth}px`,
    });
    return html`<div class="ask-ai-panel" style=${style}>
      <ai-item-list
        .host=${this.host}
        .groups=${this._actionGroups}
        .onClick=${this.onItemClick}
      ></ai-item-list>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ask-ai-panel': AskAIPanel;
  }
}
