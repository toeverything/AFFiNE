import './chat-panel-input';
import './chat-panel-messages';

import type {
  ContextEmbedStatus,
  CopilotContextDoc,
  CopilotContextFile,
  CopilotDocType,
} from '@affine/graphql';
import type { EditorHost } from '@blocksuite/affine/block-std';
import { ShadowlessElement } from '@blocksuite/affine/block-std';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { NotificationProvider } from '@blocksuite/affine/shared/services';
import type { SpecBuilder } from '@blocksuite/affine/shared/utils';
import type { Store } from '@blocksuite/affine/store';
import { HelpIcon, InformationIcon } from '@blocksuite/icons/lit';
import { type Signal, signal } from '@preact/signals-core';
import { css, html, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { createRef, type Ref, ref } from 'lit/directives/ref.js';
import { styleMap } from 'lit/directives/style-map.js';
import { throttle } from 'lodash-es';

import { AIProvider } from '../provider';
import { extractSelectedContent } from '../utils/extract';
import {
  getSelectedImagesAsBlobs,
  getSelectedTextContent,
} from '../utils/selection-utils';
import type {
  AINetworkSearchConfig,
  AppSidebarConfig,
  DocDisplayConfig,
  SearchMenuConfig,
} from './chat-config';
import type {
  ChatChip,
  ChatContextValue,
  ChatItem,
  CollectionChip,
  DocChip,
  FileChip,
  TagChip,
} from './chat-context';
import type { ChatPanelMessages } from './chat-panel-messages';
import { isCollectionChip, isDocChip, isTagChip } from './components/utils';

const DEFAULT_CHAT_CONTEXT_VALUE: ChatContextValue = {
  quote: '',
  images: [],
  abortController: null,
  items: [],
  chips: [],
  status: 'idle',
  error: null,
  markdown: '',
  embeddingProgress: [0, 0],
};

export class ChatPanel extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    chat-panel {
      width: 100%;
    }

    .chat-panel-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .chat-panel-title {
      background: var(--affine-background-primary-color);
      position: relative;
      padding: 8px 0px;
      width: 100%;
      height: 36px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 1;

      div:first-child {
        font-size: 14px;
        font-weight: 500;
        color: var(--affine-text-secondary-color);
      }

      div:last-child {
        width: 24px;
        height: 24px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
      }

      svg {
        width: 18px;
        height: 18px;
        color: var(--affine-text-secondary-color);
      }
    }

    chat-panel-messages {
      flex: 1;
      overflow-y: hidden;
    }

    .chat-panel-hints {
      margin: 0 4px;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--affine-border-color);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }

    .chat-panel-hints :first-child {
      color: var(--affine-text-primary-color);
    }

    .chat-panel-hints :nth-child(2) {
      color: var(--affine-text-secondary-color);
    }

    .chat-panel-footer {
      margin: 8px 0px;
      height: 20px;
      display: flex;
      gap: 4px;
      align-items: center;
      color: var(--affine-text-secondary-color);
      font-size: 12px;
      user-select: none;
    }
  `;

  private readonly _chatMessages: Ref<ChatPanelMessages> =
    createRef<ChatPanelMessages>();

  // request counter to track the latest request
  private _updateHistoryCounter = 0;

  private _wheelTriggered = false;

  private readonly _updateHistory = async () => {
    const { doc } = this;

    const currentRequest = ++this._updateHistoryCounter;

    const [histories, actions] = await Promise.all([
      AIProvider.histories?.chats(doc.workspace.id, doc.id),
      AIProvider.histories?.actions(doc.workspace.id, doc.id),
    ]);

    // Check if this is still the latest request
    if (currentRequest !== this._updateHistoryCounter) {
      return;
    }

    const items: ChatItem[] = actions ? [...actions] : [];

    const history = histories?.find(
      history => history.sessionId === this._chatSessionId
    );
    if (history) {
      items.push(...history.messages);
      AIProvider.LAST_ROOT_SESSION_ID = history.sessionId;
    }

    this.chatContextValue = {
      ...this.chatContextValue,
      items: items.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    };

    this._scrollToEnd();
  };

  private readonly _initChips = async () => {
    // context not initialized
    if (!this._chatSessionId || !this._chatContextId) {
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
      this._chatSessionId,
      this._chatContextId
    )) || {};

    const docChips: DocChip[] = docs.map(doc => ({
      docId: doc.id,
      state: doc.status || 'processing',
      tooltip: doc.error,
      createdAt: doc.createdAt,
    }));

    const fileChips: FileChip[] = await Promise.all(
      files.map(async file => {
        const blob = await this.host.doc.blobSync.get(file.blobId);
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

    this.chatContextValue = {
      ...this.chatContextValue,
      chips,
    };
  };

  private readonly _initEmbeddingProgress = async () => {
    await this._pollContextDocsAndFiles();
  };

  private readonly _getSessionId = async () => {
    if (this._chatSessionId) {
      return this._chatSessionId;
    }
    this._chatSessionId = await AIProvider.session?.createSession(
      this.doc.workspace.id,
      this.doc.id
    );
    return this._chatSessionId;
  };

  private readonly _getContextId = async () => {
    if (this._chatContextId) {
      return this._chatContextId;
    }
    const sessionId = await this._getSessionId();
    if (sessionId) {
      this._chatContextId = await AIProvider.context?.createContext(
        this.doc.workspace.id,
        sessionId
      );
    }
    return this._chatContextId;
  };

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor doc!: Store;

  @property({ attribute: false })
  accessor networkSearchConfig!: AINetworkSearchConfig;

  @property({ attribute: false })
  accessor appSidebarConfig!: AppSidebarConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor previewSpecBuilder!: SpecBuilder;

  @state()
  accessor isLoading = true;

  @state()
  accessor chatContextValue: ChatContextValue = DEFAULT_CHAT_CONTEXT_VALUE;

  private _chatSessionId: string | null | undefined = null;

  private _chatContextId: string | null | undefined = null;

  private _isOpen: Signal<boolean | undefined> = signal(false);

  private _width: Signal<number | undefined> = signal(undefined);

  private _pollAbortController: AbortController | null = null;

  private readonly _scrollToEnd = () => {
    if (!this._wheelTriggered) {
      this._chatMessages.value?.scrollToEnd();
    }
  };

  private readonly _throttledScrollToEnd = throttle(this._scrollToEnd, 600);

  private readonly _cleanupHistories = async () => {
    const notification = this.host.std.getOptional(NotificationProvider);
    if (!notification) return;
    try {
      if (
        await notification.confirm({
          title: 'Clear History',
          message:
            'Are you sure you want to clear all history? This action will permanently delete all content, including all chat logs and data, and cannot be undone.',
          confirmText: 'Confirm',
          cancelText: 'Cancel',
        })
      ) {
        const actionIds = this.chatContextValue.items
          .filter(item => 'sessionId' in item)
          .map(item => item.sessionId);
        await AIProvider.histories?.cleanup(
          this.doc.workspace.id,
          this.doc.id,
          [
            ...(this._chatSessionId ? [this._chatSessionId] : []),
            ...(actionIds || []),
          ]
        );
        notification.toast('History cleared');
        await this._updateHistory();
      }
    } catch {
      notification.toast('Failed to clear history');
    }
  };

  private readonly _initPanel = async () => {
    try {
      if (!this._isOpen.value) return;

      const userId = (await AIProvider.userInfo)?.id;
      if (!userId) return;

      this.isLoading = true;
      const sessions = (
        (await AIProvider.session?.getSessions(
          this.doc.workspace.id,
          this.doc.id,
          { action: false }
        )) || []
      ).filter(session => !session.parentSessionId);

      if (sessions && sessions.length) {
        this._chatSessionId = sessions.at(-1)?.id;
        await this._updateHistory();
      }
      this.isLoading = false;
      if (this._chatSessionId) {
        this._chatContextId = await AIProvider.context?.getContextId(
          this.doc.workspace.id,
          this._chatSessionId
        );
      }
      await this._initChips();
      await this._initEmbeddingProgress();
    } catch (error) {
      console.error(error);
    }
  };

  private readonly _pollContextDocsAndFiles = async () => {
    if (!this._chatSessionId || !this._chatContextId || !AIProvider.context) {
      return;
    }
    if (this._pollAbortController) {
      // already polling, reset timer
      this._abortPoll();
    }
    this._pollAbortController = new AbortController();
    await AIProvider.context.pollContextDocsAndFiles(
      this.doc.workspace.id,
      this._chatSessionId,
      this._chatContextId,
      this._onPoll,
      this._pollAbortController.signal
    );
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
    const nextChips = this.chatContextValue.chips.map(chip => {
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
    const total = count.finished + count.processing + count.failed;
    this.updateContext({
      chips: nextChips,
      embeddingProgress: [count.finished, total],
    });
    if (count.processing === 0) {
      this._abortPoll();
    }
  };

  private readonly _abortPoll = () => {
    this._pollAbortController?.abort();
    this._pollAbortController = null;
  };

  protected override updated(_changedProperties: PropertyValues) {
    if (_changedProperties.has('doc')) {
      this._abortPoll();
      this._chatSessionId = null;
      this._chatContextId = null;
      this.chatContextValue = DEFAULT_CHAT_CONTEXT_VALUE;
      this.isLoading = true;

      requestAnimationFrame(async () => {
        await this._initPanel();
      });
    }

    if (this.chatContextValue.status === 'loading') {
      // reset the wheel triggered flag when the status is loading
      this._wheelTriggered = false;
    }

    if (
      _changedProperties.has('chatContextValue') &&
      (this.chatContextValue.status === 'loading' ||
        this.chatContextValue.status === 'error' ||
        this.chatContextValue.status === 'success')
    ) {
      setTimeout(this._scrollToEnd, 500);
    }

    if (
      _changedProperties.has('chatContextValue') &&
      this.chatContextValue.status === 'transmitting'
    ) {
      this._throttledScrollToEnd();
    }
  }

  protected override firstUpdated(): void {
    const chatMessages = this._chatMessages.value;
    if (chatMessages) {
      chatMessages.updateComplete
        .then(() => {
          chatMessages.getScrollContainer()?.addEventListener('wheel', () => {
            this._wheelTriggered = true;
          });
        })
        .catch(console.error);
    }
  }

  override connectedCallback() {
    super.connectedCallback();
    if (!this.doc) throw new Error('doc is required');

    this._disposables.add(
      AIProvider.slots.actions.subscribe(({ event }) => {
        const { status } = this.chatContextValue;
        if (
          event === 'finished' &&
          (status === 'idle' || status === 'success')
        ) {
          this._updateHistory().catch(console.error);
        }
      })
    );
    this._disposables.add(
      AIProvider.slots.userInfo.subscribe(() => {
        this._initPanel().catch(console.error);
      })
    );
    this._disposables.add(
      AIProvider.slots.requestOpenWithChat.subscribe(({ host }) => {
        if (this.host === host) {
          extractSelectedContent(host)
            .then(context => {
              if (!context) return;
              this.updateContext(context);
            })
            .catch(console.error);
        }
      })
    );

    const isOpen = this.appSidebarConfig.isOpen();
    this._isOpen = isOpen.signal;
    this._disposables.add(isOpen.cleanup);

    const width = this.appSidebarConfig.getWidth();
    this._width = width.signal;
    this._disposables.add(width.cleanup);

    this._disposables.add(
      this._isOpen.subscribe(isOpen => {
        if (isOpen && this.isLoading) {
          this._initPanel().catch(console.error);
        }
      })
    );
  }

  updateContext = (context: Partial<ChatContextValue>) => {
    this.chatContextValue = { ...this.chatContextValue, ...context };
  };

  continueInChat = async () => {
    const text = await getSelectedTextContent(this.host, 'plain-text');
    const markdown = await getSelectedTextContent(this.host, 'markdown');
    const images = await getSelectedImagesAsBlobs(this.host);
    this.updateContext({
      quote: text,
      markdown,
      images,
    });
  };

  override render() {
    const width = this._width.value || 0;
    const style = styleMap({
      padding: width > 540 ? '8px 24px 0 24px' : '8px 12px 0 12px',
    });
    const [done, total] = this.chatContextValue.embeddingProgress;
    const isEmbedding = total > 0 && done < total;

    return html`<div class="chat-panel-container" style=${style}>
      <div class="chat-panel-title">
        <div>${isEmbedding ? `Embedding ${done}/${total}` : 'AFFiNE AI'}</div>
        <div
          @click=${() => {
            AIProvider.toggleGeneralAIOnboarding?.(true);
          }}
        >
          ${HelpIcon()}
        </div>
      </div>
      <chat-panel-messages
        ${ref(this._chatMessages)}
        .chatContextValue=${this.chatContextValue}
        .getSessionId=${this._getSessionId}
        .updateContext=${this.updateContext}
        .host=${this.host}
        .isLoading=${this.isLoading}
        .previewSpecBuilder=${this.previewSpecBuilder}
      ></chat-panel-messages>
      <chat-panel-chips
        .host=${this.host}
        .chatContextValue=${this.chatContextValue}
        .getContextId=${this._getContextId}
        .updateContext=${this.updateContext}
        .pollContextDocsAndFiles=${this._pollContextDocsAndFiles}
        .docDisplayConfig=${this.docDisplayConfig}
        .searchMenuConfig=${this.searchMenuConfig}
      ></chat-panel-chips>
      <chat-panel-input
        .chatContextValue=${this.chatContextValue}
        .getSessionId=${this._getSessionId}
        .getContextId=${this._getContextId}
        .networkSearchConfig=${this.networkSearchConfig}
        .updateContext=${this.updateContext}
        .host=${this.host}
        .cleanupHistories=${this._cleanupHistories}
      ></chat-panel-input>
      <div class="chat-panel-footer">
        ${InformationIcon()}
        <div>AI outputs can be misleading or wrong</div>
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-panel': ChatPanel;
  }
}
