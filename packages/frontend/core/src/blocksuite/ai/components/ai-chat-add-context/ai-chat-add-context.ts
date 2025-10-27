import { createLitPortal } from '@blocksuite/affine/components/portal';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { PlusIcon } from '@blocksuite/icons/lit';
import { flip, offset } from '@floating-ui/dom';
import { css, html } from 'lit';
import { property, query } from 'lit/decorators.js';

import type { ChatChip, DocDisplayConfig } from '../ai-chat-chips';
import type { SearchMenuConfig } from './type';

export class AIChatAddContext extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .ai-chat-add-context {
      display: flex;
      flex-shrink: 0;
      flex-grow: 0;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
  `;

  @property({ attribute: false })
  accessor docId: string | undefined;

  @property({ attribute: false })
  accessor independentMode: boolean | undefined;

  @property({ attribute: false })
  accessor addChip!: (chip: ChatChip) => Promise<void>;

  @property({ attribute: false })
  accessor addImages!: (images: File[]) => void;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor portalContainer: HTMLElement | null = null;

  @query('.ai-chat-add-context')
  accessor addButton!: HTMLDivElement;

  private abortController: AbortController | null = null;

  override render() {
    return html`
      <div
        class="ai-chat-add-context"
        data-testid="chat-panel-with-button"
        @click=${this.toggleAddDocMenu}
      >
        ${PlusIcon()}
      </div>
    `;
  }

  private readonly toggleAddDocMenu = () => {
    if (this.abortController) {
      this.abortController.abort();
      return;
    }

    this.abortController = new AbortController();
    this.abortController.signal.addEventListener('abort', () => {
      this.abortController = null;
    });

    createLitPortal({
      template: html`
        <chat-panel-add-popover
          .docId=${this.docId}
          .independentMode=${this.independentMode}
          .addChip=${this.addChip}
          .addImages=${this.addImages}
          .searchMenuConfig=${this.searchMenuConfig}
          .docDisplayConfig=${this.docDisplayConfig}
          .abortController=${this.abortController}
        ></chat-panel-add-popover>
      `,
      portalStyles: {
        zIndex: 'var(--affine-z-index-popover)',
      },
      container: this.portalContainer ?? document.body,
      computePosition: {
        referenceElement: this.addButton,
        placement: 'top-start',
        middleware: [offset({ crossAxis: -30, mainAxis: 8 }), flip()],
        autoUpdate: { animationFrame: true },
      },
      abortController: this.abortController,
      closeOnClickAway: true,
    });
  };
}
