import type { TagMeta } from '@affine/core/components/page-list';
import { createLitPortal } from '@blocksuite/affine/components/portal';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { MoreVerticalIcon } from '@blocksuite/icons/lit';
import { flip, offset } from '@floating-ui/dom';
import { computed, type Signal, signal } from '@preact/signals-core';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { isEqual } from 'lodash-es';

import type { ChatChip, DocChip, DocDisplayConfig, FileChip } from './type';
import {
  estimateTokenCount,
  getChipKey,
  isAttachmentChip,
  isCollectionChip,
  isDocChip,
  isFileChip,
  isSelectedContextChip,
  isTagChip,
} from './utils';

// 100k tokens limit for the docs context
const MAX_TOKEN_COUNT = 100000;

const MAX_CANDIDATES = 3;

export class ChatPanelChips extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .ai-chat-panel-chips {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      padding: 4px 12px;

      .collapse-button,
      .more-candidate-button {
        display: flex;
        flex-shrink: 0;
        flex-grow: 0;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
        border-radius: 4px;
        box-sizing: border-box;
        cursor: pointer;
        font-size: 12px;
        color: ${unsafeCSSVarV2('icon/primary')};
      }

      .collapse-button:hover,
      .more-candidate-button:hover {
        background-color: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
      }

      .more-candidate-button {
        border-width: 1px;
        border-style: dashed;
        border-color: ${unsafeCSSVarV2('icon/tertiary')};
        background: ${unsafeCSSVarV2('layer/background/secondary')};
        color: ${unsafeCSSVarV2('icon/secondary')};
      }

      .more-candidate-button svg {
        color: ${unsafeCSSVarV2('icon/secondary')};
      }
    }
  `;

  private _abortController: AbortController | null = null;

  @property({ attribute: false })
  accessor chips!: ChatChip[];

  @property({ attribute: false })
  accessor isCollapsed!: boolean;

  @property({ attribute: false })
  accessor independentMode: boolean | undefined;

  @property({ attribute: false })
  accessor addChip!: (chip: ChatChip) => Promise<void>;

  @property({ attribute: false })
  accessor updateChip!: (
    chip: ChatChip,
    options: Partial<DocChip | FileChip>
  ) => void;

  @property({ attribute: false })
  accessor removeChip!: (chip: ChatChip) => Promise<void>;

  @property({ attribute: false })
  accessor toggleCollapse!: () => void;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor portalContainer: HTMLElement | null = null;

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId = 'chat-panel-chips';

  @query('.more-candidate-button')
  accessor moreCandidateButton!: HTMLDivElement;

  @state()
  accessor referenceDocs: Signal<
    Array<{
      docId: string;
      title: string;
    }>
  > = signal([]);

  private _tags: Signal<TagMeta[]> = signal([]);

  private _collections: Signal<{ id: string; name: string }[]> = signal([]);

  private _cleanup: (() => void) | null = null;

  private _docIds: string[] = [];

  override render() {
    const candidates: DocChip[] = this.referenceDocs.value.map(doc => ({
      docId: doc.docId,
      state: 'candidate',
    }));
    const moreCandidates = candidates.length > MAX_CANDIDATES;
    const allChips = this.chips.concat(candidates.slice(0, MAX_CANDIDATES));
    const isCollapsed = this.isCollapsed && allChips.length > 1;
    const chips = isCollapsed ? allChips.slice(0, 1) : allChips;

    return html`<div class="ai-chat-panel-chips">
      ${repeat(
        chips,
        chip => getChipKey(chip),
        chip => {
          if (isDocChip(chip)) {
            return html`<chat-panel-doc-chip
              .chip=${chip}
              .independentMode=${this.independentMode}
              .addChip=${this.addChip}
              .updateChip=${this.updateChip}
              .removeChip=${this.removeChip}
              .checkTokenLimit=${this._checkTokenLimit}
              .docDisplayConfig=${this.docDisplayConfig}
            ></chat-panel-doc-chip>`;
          }
          if (isFileChip(chip)) {
            return html`<chat-panel-file-chip
              .chip=${chip}
              .removeChip=${this.removeChip}
            ></chat-panel-file-chip>`;
          }
          if (isAttachmentChip(chip)) {
            return html`<chat-panel-attachment-chip
              .chip=${chip}
              .removeChip=${this.removeChip}
            ></chat-panel-attachment-chip>`;
          }
          if (isTagChip(chip)) {
            const tag = this._tags.value.find(tag => tag.id === chip.tagId);
            if (!tag) {
              return null;
            }
            return html`<chat-panel-tag-chip
              .chip=${chip}
              .tag=${tag}
              .removeChip=${this.removeChip}
            ></chat-panel-tag-chip>`;
          }
          if (isCollectionChip(chip)) {
            const collection = this._collections.value.find(
              collection => collection.id === chip.collectionId
            );
            if (!collection) {
              return null;
            }
            return html`<chat-panel-collection-chip
              .chip=${chip}
              .collection=${collection}
              .removeChip=${this.removeChip}
            ></chat-panel-collection-chip>`;
          }
          if (isSelectedContextChip(chip)) {
            return html`<chat-panel-selected-chip
              .chip=${chip}
              .removeChip=${this.removeChip}
            ></chat-panel-selected-chip>`;
          }
          return null;
        }
      )}
      ${moreCandidates && !isCollapsed
        ? html`<div
            class="more-candidate-button"
            @click=${this._toggleMoreCandidatesMenu}
          >
            ${MoreVerticalIcon()}
          </div>`
        : nothing}
      ${isCollapsed
        ? html`<div class="collapse-button" @click=${this.toggleCollapse}>
            +${allChips.length - 1}
          </div>`
        : nothing}
    </div>`;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const tags = this.docDisplayConfig.getTags();
    this._tags = tags.signal;
    this._disposables.add(tags.cleanup);

    const collections = this.docDisplayConfig.getCollections();
    this._collections = collections.signal;
    this._disposables.add(collections.cleanup);
  }

  protected override updated(_changedProperties: PropertyValues): void {
    if (_changedProperties.has('chips')) {
      this._updateReferenceDocs();
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._cleanup?.();
  }

  private readonly _toggleMoreCandidatesMenu = () => {
    if (this._abortController) {
      this._abortController.abort();
      return;
    }

    this._abortController = new AbortController();
    this._abortController.signal.addEventListener('abort', () => {
      this._abortController = null;
    });

    const referenceDocs = computed(() =>
      this.referenceDocs.value.slice(MAX_CANDIDATES)
    );

    createLitPortal({
      template: html`
        <chat-panel-candidates-popover
          .addChip=${this.addChip}
          .referenceDocs=${referenceDocs}
          .docDisplayConfig=${this.docDisplayConfig}
          .abortController=${this._abortController}
        ></chat-panel-candidates-popover>
      `,
      portalStyles: {
        zIndex: 'var(--affine-z-index-popover)',
      },
      container: this.portalContainer ?? document.body,
      computePosition: {
        referenceElement: this.moreCandidateButton,
        placement: 'top-start',
        middleware: [offset({ crossAxis: 0, mainAxis: 8 }), flip()],
        autoUpdate: { animationFrame: true },
      },
      abortController: this._abortController,
      closeOnClickAway: true,
    });
  };

  private readonly _checkTokenLimit = (
    newChip: DocChip,
    newTokenCount: number
  ) => {
    const estimatedTokens = this.chips.reduce((acc, chip) => {
      if (isFileChip(chip) || isTagChip(chip) || isCollectionChip(chip)) {
        return acc;
      }
      if (isDocChip(chip) && chip.docId === newChip.docId) {
        return acc + newTokenCount;
      }

      if (
        isDocChip(chip) &&
        chip.markdown?.value &&
        chip.state === 'finished'
      ) {
        const tokenCount =
          chip.tokenCount ?? estimateTokenCount(chip.markdown.value);
        return acc + tokenCount;
      }
      if (isSelectedContextChip(chip)) {
        const tokenCount =
          estimateTokenCount(chip.combinedElementsMarkdown ?? '') +
          estimateTokenCount(chip.snapshot ?? '') +
          estimateTokenCount(chip.html ?? '');
        return acc + tokenCount;
      }
      return acc;
    }, 0);
    return estimatedTokens <= MAX_TOKEN_COUNT;
  };

  private readonly _updateReferenceDocs = () => {
    const docIds = this.chips
      .filter(isDocChip)
      .filter(chip => chip.state !== 'candidate')
      .map(chip => chip.docId);
    if (isEqual(this._docIds, docIds)) {
      return;
    }

    this._cleanup?.();
    this._docIds = docIds;
    const { signal, cleanup } = this.docDisplayConfig.getReferenceDocs(docIds);
    this.referenceDocs = signal;
    this._cleanup = cleanup;
  };
}
