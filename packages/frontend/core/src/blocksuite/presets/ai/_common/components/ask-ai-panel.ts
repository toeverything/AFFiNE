import { type EditorHost, WithDisposable } from '@blocksuite/block-std';
import {
  type AIItemGroupConfig,
  EdgelessRootService,
  scrollbarStyle,
} from '@blocksuite/blocks';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { getRootService } from '../../utils/selection-utils';

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
      box-shadow: var(--affine-shadow-2);
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
  accessor minWidth = 330;

  get _edgeless() {
    const rootService = getRootService(this.host);
    if (rootService instanceof EdgelessRootService) {
      return rootService;
    }
    return null;
  }

  get _actionGroups() {
    const filteredConfig = this.actionGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item =>
          item.showWhen
            ? item.showWhen(
                this.host.command.chain(),
                this._edgeless ? 'edgeless' : 'page',
                this.host
              )
            : true
        ),
      }))
      .filter(group => group.items.length > 0);
    return filteredConfig;
  }

  override render() {
    const style = styleMap({
      minWidth: `${this.minWidth}px`,
    });
    return html`<div class="ask-ai-panel" style=${style}>
      <ai-item-list
        .host=${this.host}
        .groups=${this._actionGroups}
      ></ai-item-list>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ask-ai-panel': AskAIPanel;
  }
}
