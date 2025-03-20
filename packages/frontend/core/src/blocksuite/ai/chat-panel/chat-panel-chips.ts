import {
  type EditorHost,
  ShadowlessElement,
} from '@blocksuite/affine/block-std';
import { createLitPortal } from '@blocksuite/affine/components/portal';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { PlusIcon } from '@blocksuite/icons/lit';
import { flip, offset } from '@floating-ui/dom';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { AIProvider } from '../provider';
import type { DocDisplayConfig, SearchMenuConfig } from './chat-config';
import type {
  ChatChip,
  ChatContextValue,
  DocChip,
  FileChip,
} from './chat-context';
import {
  estimateTokenCount,
  getChipKey,
  isDocChip,
  isFileChip,
} from './components/utils';

// 100k tokens limit for the docs context
const MAX_TOKEN_COUNT = 100000;

export class ChatPanelChips extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .chips-wrapper {
      display: flex;
      flex-wrap: wrap;
    }
    .add-button,
    .collapse-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: 1px solid var(--affine-border-color);
      border-radius: 4px;
      margin: 4px 0;
      box-sizing: border-box;
      cursor: pointer;
      font-size: 12px;
    }
    .add-button:hover,
    .collapse-button:hover {
      background-color: var(--affine-hover-color);
    }
  `;

  private _abortController: AbortController | null = null;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor chatContextValue!: ChatContextValue;

  @property({ attribute: false })
  accessor getContextId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<ChatContextValue>) => void;

  @property({ attribute: false })
  accessor pollContextDocsAndFiles!: () => void;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @query('.add-button')
  accessor addButton!: HTMLDivElement;

  @state()
  accessor isCollapsed = false;

  override render() {
    const isCollapsed =
      this.isCollapsed &&
      this.chatContextValue.chips.filter(c => c.state !== 'candidate').length >
        1;

    const chips = isCollapsed
      ? this.chatContextValue.chips.slice(0, 1)
      : this.chatContextValue.chips;

    return html` <div class="chips-wrapper">
      <div class="add-button" @click=${this._toggleAddDocMenu}>
        ${PlusIcon()}
      </div>
      ${repeat(
        chips,
        chip => getChipKey(chip),
        chip => {
          if (isDocChip(chip)) {
            return html`<chat-panel-doc-chip
              .chip=${chip}
              .addChip=${this._addChip}
              .updateChip=${this._updateChip}
              .removeChip=${this._removeChip}
              .checkTokenLimit=${this._checkTokenLimit}
              .docDisplayConfig=${this.docDisplayConfig}
              .host=${this.host}
            ></chat-panel-doc-chip>`;
          }
          if (isFileChip(chip)) {
            return html`<chat-panel-file-chip
              .chip=${chip}
              .removeChip=${this._removeChip}
            ></chat-panel-file-chip>`;
          }
          return null;
        }
      )}
      ${isCollapsed
        ? html`<div class="collapse-button" @click=${this._toggleCollapse}>
            +${this.chatContextValue.chips.length - 1}
          </div>`
        : nothing}
    </div>`;
  }

  protected override updated(_changedProperties: PropertyValues): void {
    if (
      _changedProperties.has('chatContextValue') &&
      _changedProperties.get('chatContextValue')?.status === 'loading' &&
      this.isCollapsed === false
    ) {
      this.isCollapsed = true;
    }
  }

  private readonly _toggleCollapse = () => {
    this.isCollapsed = !this.isCollapsed;
  };

  private readonly _toggleAddDocMenu = () => {
    if (this._abortController) {
      this._abortController.abort();
      return;
    }

    this._abortController = new AbortController();
    this._abortController.signal.addEventListener('abort', () => {
      this._abortController = null;
    });

    createLitPortal({
      template: html`
        <chat-panel-add-popover
          .addChip=${this._addChip}
          .searchMenuConfig=${this.searchMenuConfig}
          .abortController=${this._abortController}
        ></chat-panel-add-popover>
      `,
      portalStyles: {
        zIndex: 'var(--affine-z-index-popover)',
      },
      container: document.body,
      computePosition: {
        referenceElement: this.addButton,
        placement: 'top-start',
        middleware: [offset({ crossAxis: -30, mainAxis: 10 }), flip()],
        autoUpdate: { animationFrame: true },
      },
      abortController: this._abortController,
      closeOnClickAway: true,
    });
  };

  private readonly _addChip = async (chip: ChatChip) => {
    this.isCollapsed = false;
    if (
      this.chatContextValue.chips.length === 1 &&
      this.chatContextValue.chips[0].state === 'candidate'
    ) {
      this.updateContext({
        chips: [chip],
      });
      await this._addToContext(chip);
      return;
    }
    // remove the chip if it already exists
    const chips = this.chatContextValue.chips.filter(item => {
      if (isDocChip(chip)) {
        return !isDocChip(item) || item.docId !== chip.docId;
      } else {
        return !isFileChip(item) || item.file !== chip.file;
      }
    });
    this.updateContext({
      chips: [...chips, chip],
    });
    if (chips.length < this.chatContextValue.chips.length) {
      await this._removeFromContext(chip);
    }
    await this._addToContext(chip);
    this.pollContextDocsAndFiles();
  };

  private readonly _updateChip = (
    chip: ChatChip,
    options: Partial<DocChip | FileChip>
  ) => {
    const index = this.chatContextValue.chips.findIndex(item => {
      if (isDocChip(chip)) {
        return isDocChip(item) && item.docId === chip.docId;
      } else {
        return isFileChip(item) && item.file === chip.file;
      }
    });
    const nextChip: ChatChip = {
      ...chip,
      ...options,
    };
    this.updateContext({
      chips: [
        ...this.chatContextValue.chips.slice(0, index),
        nextChip,
        ...this.chatContextValue.chips.slice(index + 1),
      ],
    });
  };

  private readonly _removeChip = async (chip: ChatChip) => {
    if (isDocChip(chip)) {
      const removed = await this._removeFromContext(chip);
      if (removed) {
        this.updateContext({
          chips: this.chatContextValue.chips.filter(item => {
            return !isDocChip(item) || item.docId !== chip.docId;
          }),
        });
      }
    }
    if (isFileChip(chip)) {
      const removed = await this._removeFromContext(chip);
      if (removed) {
        this.updateContext({
          chips: this.chatContextValue.chips.filter(item => {
            return !isFileChip(item) || item.file !== chip.file;
          }),
        });
      }
    }
  };

  private readonly _addToContext = async (chip: ChatChip) => {
    const contextId = await this.getContextId();
    if (!contextId || !AIProvider.context) {
      return;
    }
    if (isDocChip(chip)) {
      await AIProvider.context.addContextDoc({
        contextId,
        docId: chip.docId,
      });
    }
    if (isFileChip(chip)) {
      try {
        const blobId = await this.host.doc.blobSync.set(chip.file);
        const contextFile = await AIProvider.context.addContextFile(chip.file, {
          contextId,
          blobId,
        });
        this._updateChip(chip, {
          state: contextFile.status,
          blobId: contextFile.blobId,
          fileId: contextFile.id,
        });
      } catch (e) {
        this._updateChip(chip, {
          state: 'failed',
          tooltip: e instanceof Error ? e.message : 'Add context file error',
        });
      }
    }
  };

  private readonly _removeFromContext = async (
    chip: ChatChip
  ): Promise<boolean> => {
    const contextId = await this.getContextId();
    if (!contextId || !AIProvider.context) {
      return false;
    }
    if (isDocChip(chip)) {
      return await AIProvider.context.removeContextDoc({
        contextId,
        docId: chip.docId,
      });
    }
    if (isFileChip(chip) && chip.fileId) {
      return await AIProvider.context.removeContextFile({
        contextId,
        fileId: chip.fileId,
      });
    }
    return true;
  };

  private readonly _checkTokenLimit = (
    newChip: DocChip,
    newTokenCount: number
  ) => {
    const estimatedTokens = this.chatContextValue.chips.reduce((acc, chip) => {
      if (isFileChip(chip)) {
        return acc;
      }
      if (chip.docId === newChip.docId) {
        return acc + newTokenCount;
      }
      if (chip.markdown?.value && chip.state === 'finished') {
        const tokenCount =
          chip.tokenCount ?? estimateTokenCount(chip.markdown.value);
        return acc + tokenCount;
      }
      return acc;
    }, 0);
    return estimatedTokens <= MAX_TOKEN_COUNT;
  };
}
