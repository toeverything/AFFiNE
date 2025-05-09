import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { scrollbarStyle } from '@blocksuite/affine/shared/styles';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { PlusIcon } from '@blocksuite/icons/lit';
import { type Signal, signal } from '@preact/signals-core';
import { css, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import type { DocChip, DocDisplayConfig } from './type';

export class ChatPanelCandidatesPopover extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .ai-candidates-popover {
      width: 280px;
      max-height: 450px;
      overflow-y: auto;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      border-radius: 4px;
      background: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      box-shadow: ${unsafeCSSVar('overlayPanelShadow')};
      padding: 8px;
    }

    .ai-candidates-popover icon-button {
      justify-content: flex-start;
      gap: 8px;
    }
    .ai-candidates-popover icon-button svg {
      width: 20px;
      height: 20px;
      color: var(--svg-icon-color);
    }

    ${scrollbarStyle('.ai-candidates-popover')}
  `;

  @property({ attribute: false })
  accessor referenceDocs: Signal<
    Array<{
      docId: string;
      title: string;
    }>
  > = signal([]);

  @property({ attribute: false })
  accessor abortController!: AbortController;

  @property({ attribute: false })
  accessor addChip!: (chip: DocChip) => void;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @state()
  private accessor _activatedIndex = 0;

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._handleKeyDown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._handleKeyDown);
  }

  override render() {
    return html`<div
      class="ai-candidates-popover"
      data-testid="ai-candidates-popover"
    >
      ${repeat(
        this.referenceDocs.value,
        doc => doc.docId,
        (doc, curIdx) => {
          const { docId } = doc;
          const title = this.docDisplayConfig.getTitle(docId);
          const getIcon = this.docDisplayConfig.getIcon(docId);
          const docIcon = typeof getIcon === 'function' ? getIcon() : getIcon;

          return html`<div class="candidate-item">
            <icon-button
              width="280px"
              height="30px"
              data-id=${docId}
              data-index=${curIdx}
              .text=${title}
              hover=${this._activatedIndex === curIdx}
              @click=${() => this._addDocChip(docId)}
              @mousemove=${() => (this._activatedIndex = curIdx)}
            >
              ${docIcon}
              <span slot="suffix">${PlusIcon()}</span>
            </icon-button>
          </div>`;
        }
      )}
    </div>`;
  }

  private readonly _addDocChip = (docId: string) => {
    this.addChip({
      docId,
      state: 'processing',
    });
  };

  private readonly _handleKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;

    const { key } = event;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const totalItems = this.referenceDocs.value.length;
      if (totalItems === 0) return;

      if (key === 'ArrowDown') {
        this._activatedIndex = (this._activatedIndex + 1) % totalItems;
      } else if (key === 'ArrowUp') {
        this._activatedIndex =
          (this._activatedIndex - 1 + totalItems) % totalItems;
      }
      this._scrollItemIntoView();
    } else if (key === 'Enter') {
      event.preventDefault();
      if (this.referenceDocs.value.length > 0) {
        const docId = this.referenceDocs.value[this._activatedIndex].docId;
        this._addDocChip(docId);
      }
    } else if (key === 'Escape') {
      event.preventDefault();
      this.abortController.abort();
    }
  };

  private _scrollItemIntoView() {
    requestAnimationFrame(() => {
      const element = this.renderRoot.querySelector(
        `[data-index="${this._activatedIndex}"]`
      );
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    });
  }
}
