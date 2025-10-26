import { WithDisposable } from '@blocksuite/affine/global/lit';
import { WidgetComponent, WidgetViewExtension } from '@blocksuite/affine/std';
import type { Store } from '@blocksuite/affine/store';
import { createLitPortal } from '@blocksuite/affine-components/portal';
import { css, html, LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { literal, unsafeStatic } from 'lit/static-html.js';

import { BlockDiffProvider } from '../../services/block-diff';

export const AFFINE_BLOCK_DIFF_PLAYGROUND = 'affine-block-diff-playground';
export const AFFINE_BLOCK_DIFF_PLAYGROUND_MODAL =
  'affine-block-diff-playground-modal';

export class BlockDiffPlaygroundModal extends WithDisposable(LitElement) {
  static override styles = css`
    .playground-modal {
      z-index: 10000;
      width: 600px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
      padding: 24px 20px 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .playground-textarea {
      width: 100%;
      min-height: 300px;
      resize: vertical;
      font-size: 15px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 8px;
      outline: none;
      font-family: inherit;
      box-sizing: border-box;
    }
    .playground-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
    }
    .playground-btn {
      padding: 6px 18px;
      border: none;
      border-radius: 4px;
      font-size: 15px;
      cursor: pointer;
      background: #f5f5f5;
      color: #333;
      transition: background 0.2s;
    }
    .playground-btn.primary {
      background: #1976d2;
      color: #fff;
    }
    .playground-btn.primary:hover {
      background: #1565c0;
    }
    .playground-btn:hover {
      background: #e0e0e0;
    }
  `;

  @state()
  private accessor markdown = '';

  @property({ attribute: false })
  accessor diffService!: BlockDiffProvider;

  @property({ attribute: false })
  accessor store!: Store;

  @property({ attribute: false })
  accessor onClose!: () => void;

  private readonly handleInput = (e: Event) => {
    this.markdown = (e.target as HTMLTextAreaElement).value;
  };

  private readonly handleClear = () => {
    this.markdown = '';
    this.diffService.setChangedMarkdown('');
  };

  private async getOriginalMarkdown() {
    const markdown = await this.diffService.getMarkdownFromDoc(this.store);
    return markdown;
  }

  private readonly handleConfirm = async () => {
    const originalMarkdown = await this.getOriginalMarkdown();
    this.diffService.setOriginalMarkdown(originalMarkdown);
    this.diffService.setChangedMarkdown(this.markdown);
    this.onClose();
  };

  private readonly handleInsertCurrentMarkdown = async () => {
    this.markdown = await this.getOriginalMarkdown();
  };

  private readonly stopPropagation = (e: MouseEvent) => {
    e.stopPropagation();
  };

  override render() {
    return html`
      <div class="playground-modal">
        <div class="playground-modal-title">Block Diff Playground</div>
        <div class="playground-modal-content">
          <textarea
            class="playground-textarea"
            placeholder="Please input the markdown you want to apply."
            .value=${this.markdown}
            @input=${this.handleInput}
            @focus=${(e: FocusEvent) => e.stopPropagation()}
            @pointerdown=${this.stopPropagation}
            @mousedown=${this.stopPropagation}
            @mouseup=${this.stopPropagation}
            @click=${this.stopPropagation}
            @keydown=${this.stopPropagation}
            @keyup=${this.stopPropagation}
            @copy=${this.stopPropagation}
            @cut=${this.stopPropagation}
            @paste=${this.stopPropagation}
            @blur=${(e: FocusEvent) => e.stopPropagation()}
          ></textarea>
          <div class="playground-actions">
            <button
              class="playground-btn"
              @click=${this.handleInsertCurrentMarkdown}
            >
              Insert Current Doc MD
            </button>
            <button class="playground-btn" @click=${this.handleClear}>
              Clear
            </button>
            <button class="playground-btn primary" @click=${this.handleConfirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

export class BlockDiffPlayground extends WidgetComponent {
  static override styles = css`
    .playground-fab {
      position: fixed;
      right: 32px;
      bottom: 32px;
      z-index: 9999;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #1976d2;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      transition: background 0.2s;
    }
    .playground-fab:hover {
      background: #1565c0;
    }
  `;

  @query('.playground-fab')
  accessor fab!: HTMLDivElement;

  private _abortController: AbortController | null = null;

  private get diffService() {
    return this.std.get(BlockDiffProvider);
  }

  private readonly handleOpen = () => {
    this._abortController?.abort();
    this._abortController = new AbortController();

    createLitPortal({
      template: html`
        <affine-block-diff-playground-modal
          .diffService=${this.diffService}
          .store=${this.std.store}
          .onClose=${this.handleClose}
        ></affine-block-diff-playground-modal>
      `,
      container: this.host,
      computePosition: {
        referenceElement: this.fab,
        placement: 'top-end',
      },
      closeOnClickAway: true,
      abortController: this._abortController,
    });
  };

  private readonly handleClose = () => {
    this._abortController?.abort();
  };

  override render() {
    return html`
      <div>
        <div
          class="playground-fab"
          @click=${this.handleOpen}
          title="Block Diff Playground"
        >
          🧪
        </div>
      </div>
    `;
  }
}

export const blockDiffPlayground = WidgetViewExtension(
  'affine:page',
  AFFINE_BLOCK_DIFF_PLAYGROUND,
  literal`${unsafeStatic(AFFINE_BLOCK_DIFF_PLAYGROUND)}`
);
