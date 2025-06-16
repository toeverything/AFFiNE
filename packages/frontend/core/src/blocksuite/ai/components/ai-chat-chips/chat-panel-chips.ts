import type { TagMeta } from '@affine/core/components/page-list';
import { createLitPortal } from '@blocksuite/affine/components/portal';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { type EditorHost, ShadowlessElement } from '@blocksuite/affine/std';
import { MoreVerticalIcon, PlusIcon } from '@blocksuite/icons/lit';
import { flip, offset } from '@floating-ui/dom';
import { computed, type Signal, signal } from '@preact/signals-core';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { isEqual } from 'lodash-es';

import { AIProvider } from '../../provider';
import type {
  ChatChip,
  CollectionChip,
  DocChip,
  DocDisplayConfig,
  FileChip,
  SearchMenuConfig,
  TagChip,
} from './type';
import {
  estimateTokenCount,
  getChipKey,
  isCollectionChip,
  isDocChip,
  isFileChip,
  isTagChip,
} from './utils';

// 100k tokens limit for the docs context
const MAX_TOKEN_COUNT = 100000;

const MAX_CANDIDATES = 3;

export class ChatPanelChips extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .chips-wrapper {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      padding: 4px 12px;
    }
    .add-button,
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
    .add-button:hover,
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
  `;

  private _abortController: AbortController | null = null;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor chips!: ChatChip[];

  @property({ attribute: false })
  accessor createContextId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor updateChips!: (chips: ChatChip[]) => void;

  @property({ attribute: false })
  accessor addImages!: (images: File[]) => void;

  @property({ attribute: false })
  accessor pollContextDocsAndFiles!: () => void;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor portalContainer: HTMLElement | null = null;

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId = 'chat-panel-chips';

  @query('.add-button')
  accessor addButton!: HTMLDivElement;

  @query('.more-candidate-button')
  accessor moreCandidateButton!: HTMLDivElement;

  @state()
  accessor isCollapsed = false;

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

    return html`<div class="chips-wrapper">
      <div
        class="add-button"
        data-testid="chat-panel-with-button"
        @click=${this._toggleAddDocMenu}
      >
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
          if (isTagChip(chip)) {
            const tag = this._tags.value.find(tag => tag.id === chip.tagId);
            if (!tag) {
              return null;
            }
            return html`<chat-panel-tag-chip
              .chip=${chip}
              .tag=${tag}
              .removeChip=${this._removeChip}
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
              .removeChip=${this._removeChip}
            ></chat-panel-collection-chip>`;
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
        ? html`<div class="collapse-button" @click=${this._toggleCollapse}>
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
    if (
      _changedProperties.has('chatContextValue') &&
      _changedProperties.get('chatContextValue')?.status === 'loading' &&
      this.isCollapsed === false
    ) {
      this.isCollapsed = true;
    }

    if (_changedProperties.has('chips')) {
      this._updateReferenceDocs();
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._cleanup?.();
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
          .addImages=${this.addImages}
          .searchMenuConfig=${this.searchMenuConfig}
          .docDisplayConfig=${this.docDisplayConfig}
          .abortController=${this._abortController}
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
      abortController: this._abortController,
      closeOnClickAway: true,
    });
  };

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
          .addChip=${this._addChip}
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

  private readonly _addChip = async (chip: ChatChip) => {
    this.isCollapsed = false;
    // remove the chip if it already exists
    const chips = this._omitChip(this.chips, chip);
    this.updateChips([...chips, chip]);
    if (chips.length < this.chips.length) {
      await this._removeFromContext(chip);
    }
    await this._addToContext(chip);
    this.pollContextDocsAndFiles();
  };

  private readonly _updateChip = (
    chip: ChatChip,
    options: Partial<DocChip | FileChip>
  ) => {
    const index = this._findChipIndex(this.chips, chip);
    if (index === -1) {
      return;
    }
    const nextChip: ChatChip = {
      ...chip,
      ...options,
    };
    this.updateChips([
      ...this.chips.slice(0, index),
      nextChip,
      ...this.chips.slice(index + 1),
    ]);
  };

  private readonly _removeChip = async (chip: ChatChip) => {
    const chips = this._omitChip(this.chips, chip);
    this.updateChips(chips);
    if (chips.length < this.chips.length) {
      await this._removeFromContext(chip);
    }
  };

  private readonly _addToContext = async (chip: ChatChip) => {
    if (isDocChip(chip)) {
      return await this._addDocToContext(chip);
    }
    if (isFileChip(chip)) {
      return await this._addFileToContext(chip);
    }
    if (isTagChip(chip)) {
      return await this._addTagToContext(chip);
    }
    if (isCollectionChip(chip)) {
      return await this._addCollectionToContext(chip);
    }
    return null;
  };

  private readonly _addDocToContext = async (chip: DocChip) => {
    try {
      const contextId = await this.createContextId();
      if (!contextId || !AIProvider.context) {
        throw new Error('Context not found');
      }
      await AIProvider.context.addContextDoc({
        contextId,
        docId: chip.docId,
      });
    } catch (e) {
      this._updateChip(chip, {
        state: 'failed',
        tooltip: e instanceof Error ? e.message : 'Add context doc error',
      });
    }
  };

  private readonly _addFileToContext = async (chip: FileChip) => {
    try {
      const contextId = await this.createContextId();
      if (!contextId || !AIProvider.context) {
        throw new Error('Context not found');
      }
      const blobId = await this.host.store.blobSync.set(chip.file);
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
  };

  private readonly _addTagToContext = async (chip: TagChip) => {
    try {
      const contextId = await this.createContextId();
      if (!contextId || !AIProvider.context) {
        throw new Error('Context not found');
      }
      // TODO: server side docIds calculation
      const docIds = this.docDisplayConfig.getTagPageIds(chip.tagId);
      await AIProvider.context.addContextTag({
        contextId,
        tagId: chip.tagId,
        docIds,
      });
      this._updateChip(chip, {
        state: 'finished',
      });
    } catch (e) {
      this._updateChip(chip, {
        state: 'failed',
        tooltip: e instanceof Error ? e.message : 'Add context tag error',
      });
    }
  };

  private readonly _addCollectionToContext = async (chip: CollectionChip) => {
    try {
      const contextId = await this.createContextId();
      if (!contextId || !AIProvider.context) {
        throw new Error('Context not found');
      }
      // TODO: server side docIds calculation
      const docIds = this.docDisplayConfig.getCollectionPageIds(
        chip.collectionId
      );
      await AIProvider.context.addContextCollection({
        contextId,
        collectionId: chip.collectionId,
        docIds,
      });
      this._updateChip(chip, {
        state: 'finished',
      });
    } catch (e) {
      this._updateChip(chip, {
        state: 'failed',
        tooltip:
          e instanceof Error ? e.message : 'Add context collection error',
      });
    }
  };

  private readonly _removeFromContext = async (
    chip: ChatChip
  ): Promise<boolean> => {
    try {
      const contextId = await this.createContextId();
      if (!contextId || !AIProvider.context) {
        return true;
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
      if (isTagChip(chip)) {
        return await AIProvider.context.removeContextTag({
          contextId,
          tagId: chip.tagId,
        });
      }
      if (isCollectionChip(chip)) {
        return await AIProvider.context.removeContextCollection({
          contextId,
          collectionId: chip.collectionId,
        });
      }
      return true;
    } catch {
      return true;
    }
  };

  private readonly _checkTokenLimit = (
    newChip: DocChip,
    newTokenCount: number
  ) => {
    const estimatedTokens = this.chips.reduce((acc, chip) => {
      if (isFileChip(chip) || isTagChip(chip) || isCollectionChip(chip)) {
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

  private readonly _omitChip = (chips: ChatChip[], chip: ChatChip) => {
    return chips.filter(item => {
      if (isDocChip(chip)) {
        return !isDocChip(item) || item.docId !== chip.docId;
      }
      if (isFileChip(chip)) {
        return !isFileChip(item) || item.file !== chip.file;
      }
      if (isTagChip(chip)) {
        return !isTagChip(item) || item.tagId !== chip.tagId;
      }
      if (isCollectionChip(chip)) {
        return (
          !isCollectionChip(item) || item.collectionId !== chip.collectionId
        );
      }
      return true;
    });
  };

  private readonly _findChipIndex = (chips: ChatChip[], chip: ChatChip) => {
    return chips.findIndex(item => {
      if (isDocChip(chip)) {
        return isDocChip(item) && item.docId === chip.docId;
      }
      if (isFileChip(chip)) {
        return isFileChip(item) && item.file === chip.file;
      }
      if (isTagChip(chip)) {
        return isTagChip(item) && item.tagId === chip.tagId;
      }
      if (isCollectionChip(chip)) {
        return (
          isCollectionChip(item) && item.collectionId === chip.collectionId
        );
      }
      return -1;
    });
  };
}
