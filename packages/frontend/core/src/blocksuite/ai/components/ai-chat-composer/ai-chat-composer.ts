import './ai-chat-composer-tip';

import type {
  ContextEmbedStatus,
  ContextWorkspaceEmbeddingStatus,
  CopilotContextDoc,
  CopilotContextFile,
  CopilotDocType,
  CopilotSessionType,
} from '@affine/graphql';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { Store } from '@blocksuite/affine/store';
import { type Signal, signal } from '@preact/signals-core';
import { css, html, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';

import { AIProvider } from '../../provider';
import type {
  ChatChip,
  CollectionChip,
  DocChip,
  DocDisplayConfig,
  FileChip,
  SearchMenuConfig,
  TagChip,
} from '../ai-chat-chips';
import { isCollectionChip, isDocChip, isTagChip } from '../ai-chat-chips';
import type {
  AIChatInputContext,
  AIModelSwitchConfig,
  AINetworkSearchConfig,
  AIReasoningConfig,
} from '../ai-chat-input';
import { MAX_IMAGE_COUNT } from '../ai-chat-input/const';

export const EMBEDDING_STATUS_CHECK_INTERVAL = 10000;

export class AIChatComposer extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .chat-panel-footer {
      margin: 8px 0px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--affine-text-secondary-color);
      font-size: 12px;
      user-select: none;
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor doc!: Store;

  @property({ attribute: false })
  accessor session!: CopilotSessionType | undefined;

  @property({ attribute: false })
  accessor getSessionId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor createSessionId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor chatContextValue!: AIChatInputContext;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<AIChatInputContext>) => void;

  @property({ attribute: false })
  accessor isVisible: Signal<boolean | undefined> = signal(false);

  @property({ attribute: false })
  accessor updateEmbeddingProgress!: (
    count: Record<ContextEmbedStatus, number>
  ) => void;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor networkSearchConfig!: AINetworkSearchConfig;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor modelSwitchConfig!: AIModelSwitchConfig;

  @property({ attribute: false })
  accessor onChatSuccess: (() => void) | undefined;

  @property({ attribute: false })
  accessor trackOptions: BlockSuitePresets.TrackerOptions | undefined;

  @property({ attribute: false })
  accessor portalContainer: HTMLElement | null = null;

  @property({ attribute: false })
  accessor panelWidth: Signal<number | undefined> = signal(undefined);

  @state()
  accessor chips: ChatChip[] = [];

  @state()
  accessor embeddingProgressText = 'Loading embedding status...';

  @state()
  accessor embeddingCompleted = false;

  private _isInitialized = false;

  private _isLoading = false;

  private _contextId: string | undefined = undefined;

  private _pollAbortController: AbortController | null = null;

  private _pollEmbeddingStatusAbortController: AbortController | null = null;

  override render() {
    return html`
      <chat-panel-chips
        .host=${this.host}
        .chips=${this.chips}
        .createContextId=${this._createContextId}
        .updateChips=${this.updateChips}
        .pollContextDocsAndFiles=${this._pollContextDocsAndFiles}
        .docDisplayConfig=${this.docDisplayConfig}
        .searchMenuConfig=${this.searchMenuConfig}
        .portalContainer=${this.portalContainer}
        .addImages=${this.addImages}
      ></chat-panel-chips>
      <ai-chat-input
        .host=${this.host}
        .chips=${this.chips}
        .session=${this.session}
        .getSessionId=${this.getSessionId}
        .createSessionId=${this.createSessionId}
        .getContextId=${this._getContextId}
        .chatContextValue=${this.chatContextValue}
        .updateContext=${this.updateContext}
        .networkSearchConfig=${this.networkSearchConfig}
        .reasoningConfig=${this.reasoningConfig}
        .modelSwitchConfig=${this.modelSwitchConfig}
        .docDisplayConfig=${this.docDisplayConfig}
        .onChatSuccess=${this.onChatSuccess}
        .trackOptions=${this.trackOptions}
        .panelWidth=${this.panelWidth}
        .addImages=${this.addImages}
      ></ai-chat-input>
      <div class="chat-panel-footer">
        <ai-chat-composer-tip
          .tips=${[
            html`<span>AI outputs can be misleading or wrong</span>`,
            this.embeddingCompleted
              ? null
              : html`<ai-chat-embedding-status-tooltip
                  .progressText=${this.embeddingProgressText}
                />`,
          ].filter(Boolean)}
          .loop=${false}
        ></ai-chat-composer-tip>
      </div>
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();
    if (!this.doc) throw new Error('doc is required');

    this._disposables.add(
      AIProvider.slots.userInfo.subscribe(() => {
        this._initComposer().catch(console.error);
      })
    );

    this._disposables.add(
      this.isVisible.subscribe(isVisible => {
        if (isVisible && !this._isInitialized) {
          this._initComposer().catch(console.error);
        }
        if (!isVisible) {
          this._abortPoll();
          this._abortPollEmbeddingStatus();
        }
      })
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._abortPoll();
    this._abortPollEmbeddingStatus();
  }

  protected override willUpdate(_changedProperties: PropertyValues) {
    if (_changedProperties.has('doc')) {
      this._resetComposer();
      requestAnimationFrame(async () => {
        await this._initComposer();
      });
    }
  }

  private readonly _getContextId = async () => {
    if (this._contextId) {
      return this._contextId;
    }

    const sessionId = await this.getSessionId();
    if (!sessionId) return;

    const contextId = await AIProvider.context?.getContextId(
      this.doc.workspace.id,
      sessionId
    );
    this._contextId = contextId;
    return this._contextId;
  };

  private readonly _createContextId = async () => {
    if (this._contextId) {
      return this._contextId;
    }

    const sessionId = await this.createSessionId();
    if (!sessionId) return;

    this._contextId = await AIProvider.context?.createContext(
      this.doc.workspace.id,
      sessionId
    );
    return this._contextId;
  };

  private readonly _initChips = async () => {
    // context not initialized
    const sessionId = await this.getSessionId();
    const contextId = await this._getContextId();
    if (!sessionId || !contextId) {
      return;
    }

    // context initialized, show the chips
    const {
      docs = [],
      files = [],
      tags = [],
      collections = [],
    } = (await AIProvider.context?.getContextDocsAndFiles(
      this.doc.workspace.id,
      sessionId,
      contextId
    )) || {};

    const docChips: DocChip[] = docs.map(doc => ({
      docId: doc.id,
      state: doc.status || 'processing',
      tooltip: doc.error,
      createdAt: doc.createdAt,
    }));

    const fileChips: FileChip[] = await Promise.all(
      files.map(async file => {
        const blob = await this.host.store.blobSync.get(file.blobId);
        return {
          file: new File(blob ? [blob] : [], file.name),
          blobId: file.blobId,
          fileId: file.id,
          state: blob ? file.status : 'failed',
          tooltip: blob ? file.error : 'File not found in blob storage',
          createdAt: file.createdAt,
        };
      })
    );

    const tagChips: TagChip[] = tags.map(tag => ({
      tagId: tag.id,
      state: 'finished',
      createdAt: tag.createdAt,
    }));

    const collectionChips: CollectionChip[] = collections.map(collection => ({
      collectionId: collection.id,
      state: 'finished',
      createdAt: collection.createdAt,
    }));

    const chips: ChatChip[] = [
      ...docChips,
      ...fileChips,
      ...tagChips,
      ...collectionChips,
    ].sort((a, b) => {
      const aTime = a.createdAt ?? Date.now();
      const bTime = b.createdAt ?? Date.now();
      return aTime - bTime;
    });

    this.updateChips(chips);
  };

  private readonly updateChips = (chips: ChatChip[]) => {
    this.chips = chips;
  };

  private readonly addImages = (images: File[]) => {
    const oldImages = this.chatContextValue.images;
    this.updateContext({
      images: [...oldImages, ...images].slice(0, MAX_IMAGE_COUNT),
    });
  };

  private readonly _pollContextDocsAndFiles = async () => {
    const sessionId = await this.getSessionId();
    const contextId = await this._getContextId();
    if (!sessionId || !contextId || !AIProvider.context) {
      return;
    }
    if (this._pollAbortController) {
      // already polling, reset timer
      this._abortPoll();
    }
    this._pollAbortController = new AbortController();
    await AIProvider.context.pollContextDocsAndFiles(
      this.doc.workspace.id,
      sessionId,
      contextId,
      this._onPoll,
      this._pollAbortController.signal
    );
  };

  private readonly _pollEmbeddingStatus = async () => {
    if (this._pollEmbeddingStatusAbortController) {
      this._pollEmbeddingStatusAbortController.abort();
    }
    this._pollEmbeddingStatusAbortController = new AbortController();
    const signal = this._pollEmbeddingStatusAbortController.signal;

    try {
      await AIProvider.context?.pollEmbeddingStatus(
        this.host.std.workspace.id,
        (status: ContextWorkspaceEmbeddingStatus) => {
          if (!status) {
            this.embeddingProgressText = 'Loading embedding status...';
            this.embeddingCompleted = false;
            return;
          }
          const completed = status.embedded === status.total;
          this.embeddingCompleted = completed;
          if (completed) {
            this.embeddingProgressText =
              'Embedding finished. You are getting the best results!';
          } else {
            this.embeddingProgressText =
              'File not embedded yet. Results will improve after embedding.';
          }
        },
        signal
      );
    } catch {
      this.embeddingProgressText = 'Failed to load embedding status...';
      this.embeddingCompleted = false;
    }
  };

  private readonly _onPoll = (
    result?: BlockSuitePresets.AIDocsAndFilesContext
  ) => {
    if (!result) {
      this._abortPoll();
      return;
    }
    const {
      docs: sDocs = [],
      files = [],
      tags = [],
      collections = [],
    } = result;
    const docs = [
      ...sDocs,
      ...tags.flatMap(tag => tag.docs),
      ...collections.flatMap(collection => collection.docs),
    ];
    const hashMap = new Map<
      string,
      CopilotContextDoc | CopilotDocType | CopilotContextFile
    >();
    const count: Record<ContextEmbedStatus, number> = {
      finished: 0,
      processing: 0,
      failed: 0,
    };
    docs.forEach(doc => {
      hashMap.set(doc.id, doc);
      doc.status && count[doc.status]++;
    });
    files.forEach(file => {
      hashMap.set(file.id, file);
      file.status && count[file.status]++;
    });
    const nextChips = this.chips.map(chip => {
      if (isTagChip(chip) || isCollectionChip(chip)) {
        return chip;
      }
      const id = isDocChip(chip) ? chip.docId : chip.fileId;
      const item = id && hashMap.get(id);
      if (item && item.status) {
        return {
          ...chip,
          state: item.status,
          tooltip: 'error' in item ? item.error : undefined,
        };
      }
      return chip;
    });
    this.updateChips(nextChips);
    this.updateEmbeddingProgress(count);
    if (count.processing === 0) {
      this._abortPoll();
    }
  };

  private readonly _abortPoll = () => {
    this._pollAbortController?.abort();
    this._pollAbortController = null;
  };

  private readonly _abortPollEmbeddingStatus = () => {
    this._pollEmbeddingStatusAbortController?.abort();
    this._pollEmbeddingStatusAbortController = null;
  };

  private readonly _initComposer = async () => {
    if (!this.isVisible.value) return;
    if (this._isLoading) return;

    const userId = (await AIProvider.userInfo)?.id;
    if (!userId) return;

    this._isLoading = true;
    await this._initChips();
    const needPoll = this.chips.some(
      chip =>
        chip.state === 'processing' || isTagChip(chip) || isCollectionChip(chip)
    );
    if (needPoll) {
      await this._pollContextDocsAndFiles();
    }
    await this._pollEmbeddingStatus();
    this._isLoading = false;
    this._isInitialized = true;
  };

  private readonly _resetComposer = () => {
    this._abortPoll();
    this._abortPollEmbeddingStatus();
    this.chips = [];
    this._contextId = undefined;
    this._isLoading = false;
    this._isInitialized = false;
  };
}
