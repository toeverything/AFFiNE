import type { CopilotChatHistoryFragment } from '@affine/graphql';

import type { AIRequestService } from '../request';
import type { AIChatAction, AIChatSendOptions } from './actions';
import type { AIChatSessionStrategy } from './session-strategy';
import {
  type AIChatContextItem,
  type AIChatMessage,
  type AIChatScope,
  type AIChatSnapshot,
  type AIChatStatus,
  type AIChatTab,
  createDraftTab,
  createInitialComposerState,
  sessionToTab,
} from './state';

type RuntimeOptions = {
  request: AIRequestService;
  scope: AIChatScope;
  strategy: AIChatSessionStrategy;
};

type ContextStatus = 'finished' | 'processing' | 'failed';

type ContextObject = {
  id?: string;
  docId?: string;
  blobId?: string;
  name?: string;
  status?: ContextStatus;
  error?: string | null;
  createdAt?: number | null;
  docs?: ContextObject[];
};

type ContextData = {
  docs?: ContextObject[];
  files?: ContextObject[];
  tags?: ContextObject[];
  collections?: ContextObject[];
  blobs?: ContextObject[];
};

type EmbeddingStatus = {
  embedded: number;
  total: number;
};

const CONTEXT_POLLING_INTERVAL = 10000;

export class AIChatRuntime {
  private readonly listeners = new Set<() => void>();
  private requestSeq = 0;
  private historyRequestSeq = 0;
  private contextRequestSeq = 0;
  private streamAbortController: AbortController | null = null;
  private contextPollingAbortController: AbortController | null = null;
  private embeddingStatusAbortController: AbortController | null = null;
  private createSessionPromiseKey: string | null = null;
  private createSessionPromise: Promise<
    CopilotChatHistoryFragment | null | undefined
  > | null = null;
  private snapshot: AIChatSnapshot;

  constructor(private readonly options: RuntimeOptions) {
    this.snapshot = this.createInitialSnapshot(options.scope);
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async createSession(options: { pinned?: boolean } = {}) {
    const session = await this.options.strategy.createSession(
      this.snapshot.scope,
      this.options.request,
      options
    );
    if (session) {
      this.openSessionObject(session, true);
    }
    return session ?? undefined;
  }

  loadInitialSession() {
    return this.options.strategy.loadInitialSession(
      this.snapshot.scope,
      this.options.request
    );
  }

  dispose() {
    this.requestSeq++;
    this.createSessionPromise = null;
    this.createSessionPromiseKey = null;
    this.streamAbortController?.abort();
    this.contextPollingAbortController?.abort();
    this.embeddingStatusAbortController?.abort();
    this.listeners.clear();
  }

  async dispatch(action: AIChatAction) {
    switch (action.type) {
      case 'initialize':
        await this.initialize(action.scope ?? this.snapshot.scope);
        return;
      case 'setScope':
        await this.setScope(action.scope);
        return;
      case 'refreshHistory':
        await this.refreshHistory();
        return;
      case 'openSession':
        await this.openSession(action.sessionId);
        return;
      case 'openSessionObject':
        this.openSessionObject(action.session);
        return;
      case 'closeTab':
        await this.closeTab(action.tabId);
        return;
      case 'createNewSession':
        await this.createNewSession(action.pinned);
        return;
      case 'togglePinActiveSession':
        await this.togglePinActiveSession();
        return;
      case 'send':
        await this.send(action);
        return;
      case 'retry':
        await this.retry();
        return;
      case 'stop':
        this.stop();
        return;
      case 'deleteSession':
        await this.deleteSession(action.sessionId);
        return;
      case 'clearError':
        this.commit({ status: 'idle', error: null });
        return;
      case 'setComposerText':
        this.updateComposer({ text: action.text });
        return;
      case 'setReasoning':
        this.updateComposer({ reasoning: action.reasoning });
        return;
      case 'setModel':
        this.updateComposer({ modelId: action.modelId });
        return;
      case 'addAttachment':
        this.updateComposer({
          attachments: [
            ...this.snapshot.composer.attachments,
            action.attachment,
          ],
        });
        return;
      case 'removeAttachment':
        this.updateComposer({
          attachments: this.snapshot.composer.attachments.filter(
            (_, index) => index !== action.index
          ),
        });
        return;
      case 'addContextItem':
        await this.addContextItem(action.item);
        return;
      case 'removeContextItem':
        await this.removeContextItem(action.item);
        return;
      case 'loadContext':
        await this.loadContext();
        return;
      case 'startContextPolling':
        this.startContextPolling();
        return;
      case 'stopContextPolling':
        this.stopContextPolling();
        return;
      case 'pollContext':
        await this.pollContext();
        return;
      case 'pollEmbeddingStatus':
        this.pollEmbeddingStatus();
        return;
    }
  }

  private createInitialSnapshot(scope: AIChatScope): AIChatSnapshot {
    const draft = createDraftTab(scope);
    return {
      scope,
      readiness: 'initializing',
      activeSessionId: null,
      activeTabId: draft.id,
      tabs: [draft],
      sessions: [],
      history: {
        currentDoc: [],
        recent: [],
        loading: false,
        error: null,
      },
      messages: [],
      status: 'idle',
      error: null,
      composer: createInitialComposerState(),
      navigationRequest: null,
      uiPolicy: this.createUiPolicy('idle', [draft], draft.id),
    };
  }

  private commit(patch: Partial<AIChatSnapshot>) {
    const next = {
      ...this.snapshot,
      ...patch,
    };
    this.snapshot = {
      ...next,
      uiPolicy: this.createUiPolicy(next.status, next.tabs, next.activeTabId),
    };
    this.listeners.forEach(listener => listener());
  }

  private createUiPolicy(
    status: AIChatStatus,
    tabs: AIChatTab[],
    activeTabId: string | null
  ): AIChatSnapshot['uiPolicy'] {
    const activeTab = tabs.find(tab => tab.id === activeTabId);
    const isGenerating = status === 'loading' || status === 'transmitting';
    return {
      showDraftTab: activeTab?.kind === 'draft',
      canCreateNewSession: !!activeTab?.hasMessages && !isGenerating,
      canCloseActiveTab: activeTab?.kind === 'session' && tabs.length > 1,
      canPinActiveSession: activeTab?.kind === 'session',
      canSend: !isGenerating,
    };
  }

  private getScopeKey(scope: AIChatScope) {
    switch (scope.kind) {
      case 'doc':
        return `${scope.kind}:${scope.workspaceId}:${scope.docId}`;
      case 'workspace':
        return `${scope.kind}:${scope.workspaceId}`;
      case 'fork':
        return `${scope.kind}:${scope.workspaceId}:${scope.parentSessionId}:${scope.latestMessageId ?? ''}:${scope.docId ?? ''}`;
      case 'chat-block':
        return `${scope.kind}:${scope.workspaceId}:${scope.docId}:${scope.blockId}:${scope.parentSessionId ?? ''}:${scope.latestMessageId ?? ''}`;
      case 'playground':
        return `${scope.kind}:${scope.workspaceId}:${scope.docId ?? ''}:${scope.parentSessionId ?? ''}:${scope.latestMessageId ?? ''}`;
    }
  }

  private markActiveTabHasMessages(tabs: AIChatTab[]) {
    return tabs.map(tab =>
      tab.kind === 'session' && tab.id === this.snapshot.activeTabId
        ? { ...tab, hasMessages: true }
        : tab
    );
  }

  private async initialize(scope: AIChatScope) {
    const seq = ++this.requestSeq;
    this.commit({
      ...this.createInitialSnapshot(scope),
      readiness: 'initializing',
    });
    const session = await this.options.strategy.loadInitialSession(
      scope,
      this.options.request
    );
    if (seq !== this.requestSeq) return;
    if (!session) {
      const draft = this.options.strategy.createDraftSession(scope);
      this.commit({
        readiness: 'ready',
        tabs: [draft],
        sessions: [],
        activeTabId: draft.id,
        activeSessionId: null,
        messages: [],
      });
      return;
    }
    this.openSessionObject(session);
    this.commit({ readiness: 'ready' });
  }

  private async setScope(scope: AIChatScope) {
    this.stop();
    this.createSessionPromise = null;
    this.createSessionPromiseKey = null;
    await this.initialize(scope);
  }

  private async ensureSession() {
    const activeSessionId = this.snapshot.activeSessionId;
    if (activeSessionId) {
      return (
        this.snapshot.sessions.find(
          session => session.sessionId === activeSessionId
        ) ??
        this.options.request.getSession(
          this.snapshot.scope.workspaceId,
          activeSessionId
        )
      );
    }
    const scopeKey = this.getScopeKey(this.snapshot.scope);
    if (
      !this.createSessionPromise ||
      this.createSessionPromiseKey !== scopeKey
    ) {
      this.createSessionPromiseKey = scopeKey;
      this.createSessionPromise = this.options.strategy
        .createSession(this.snapshot.scope, this.options.request)
        .finally(() => {
          this.createSessionPromise = null;
          this.createSessionPromiseKey = null;
        });
    }
    return this.createSessionPromise;
  }

  private resetLastAssistantMessage(messages: AIChatMessage[]) {
    return messages.map((message, index) =>
      index === messages.length - 1 && message.role === 'assistant'
        ? { ...message, content: '', createdAt: new Date().toISOString() }
        : message
    );
  }

  private getLastUserMessage() {
    return this.snapshot.messages.findLast(message => message.role === 'user');
  }

  private async send(options: AIChatSendOptions, retryExisting = false) {
    const content = options.input || this.snapshot.composer.text;
    if (!content.trim() || !this.snapshot.uiPolicy.canSend) return;
    const seq = ++this.requestSeq;
    this.streamAbortController?.abort();
    this.streamAbortController = new AbortController();
    this.commit({
      status: 'loading',
      error: null,
      messages: retryExisting
        ? this.resetLastAssistantMessage(this.snapshot.messages)
        : [
            ...this.snapshot.messages,
            this.createMessage('user', content, {
              attachments: options.attachmentPreviews,
              ...options.userInfo,
            }),
            this.createMessage('assistant', ''),
          ],
    });
    try {
      const session = await this.ensureSession();
      if (seq !== this.requestSeq) return;
      if (!session) {
        this.commit({ status: 'error', error: new Error('Session not found') });
        return;
      }
      if (!this.snapshot.activeSessionId) {
        this.openSessionObject(session, true);
      }

      const stream = (await this.options.request.executeAction('chat', {
        workspaceId: this.snapshot.scope.workspaceId,
        docId:
          'docId' in this.snapshot.scope
            ? this.snapshot.scope.docId
            : undefined,
        sessionId: session.sessionId,
        input: content,
        contexts: options.contexts,
        attachments: options.attachments ?? this.snapshot.composer.attachments,
        contextId: this.snapshot.composer.context.contextId,
        reasoning: options.reasoning ?? this.snapshot.composer.reasoning,
        toolsConfig: options.toolsConfig ?? this.snapshot.composer.toolsConfig,
        modelId: options.modelId ?? this.snapshot.composer.modelId,
        isRootSession: options.isRootSession,
        where: options.where,
        control: options.control,
        stream: true,
        signal: this.streamAbortController.signal,
      })) as AsyncIterable<string>;

      for await (const chunk of stream) {
        if (seq !== this.requestSeq) return;
        this.appendAssistantContent(chunk);
        this.commit({ status: 'transmitting' });
      }
      if (seq !== this.requestSeq) return;
      this.commit({
        status: 'success',
        tabs: this.markActiveTabHasMessages(this.snapshot.tabs),
        composer: {
          ...this.snapshot.composer,
          text: '',
          attachments: [],
        },
      });
      await this.refreshLastMessageId(session.sessionId).catch(console.error);
      await this.bindActiveSessionToDoc().catch(console.error);
    } catch (error) {
      if (seq !== this.requestSeq) return;
      this.commit({ status: 'error', error: this.toError(error) });
    }
  }

  private async retry() {
    if (!this.snapshot.uiPolicy.canSend) {
      return;
    }
    if (!this.snapshot.activeSessionId) {
      const lastUserMessage = this.getLastUserMessage();
      if (lastUserMessage) {
        await this.send({ input: lastUserMessage.content }, true);
      }
      return;
    }
    const seq = ++this.requestSeq;
    this.streamAbortController?.abort();
    this.streamAbortController = new AbortController();
    this.commit({
      status: 'loading',
      error: null,
      messages: this.resetLastAssistantMessage(this.snapshot.messages),
    });
    try {
      const stream = (await this.options.request.executeAction('chat', {
        workspaceId: this.snapshot.scope.workspaceId,
        sessionId: this.snapshot.activeSessionId,
        retry: true,
        stream: true,
        signal: this.streamAbortController.signal,
      })) as AsyncIterable<string>;
      for await (const chunk of stream) {
        if (seq !== this.requestSeq) return;
        this.appendAssistantContent(chunk);
        this.commit({ status: 'transmitting' });
      }
      if (seq === this.requestSeq) {
        this.commit({ status: 'success' });
        await this.refreshLastMessageId(this.snapshot.activeSessionId).catch(
          console.error
        );
        await this.bindActiveSessionToDoc().catch(console.error);
      }
    } catch (error) {
      if (seq !== this.requestSeq) return;
      this.commit({ status: 'error', error: this.toError(error) });
    }
  }

  private stop() {
    this.requestSeq++;
    this.streamAbortController?.abort();
    this.streamAbortController = null;
    if (
      this.snapshot.status === 'loading' ||
      this.snapshot.status === 'transmitting'
    ) {
      this.commit({ status: 'success' });
    }
  }

  private async refreshHistory() {
    const seq = ++this.historyRequestSeq;
    this.commit({
      history: { ...this.snapshot.history, loading: true, error: null },
    });
    try {
      const currentDoc =
        this.snapshot.scope.kind === 'doc'
          ? ((await this.options.request.getSessions(
              this.snapshot.scope.workspaceId,
              this.snapshot.scope.docId,
              { action: false, fork: false }
            )) ?? [])
          : [];
      const recent =
        (await this.options.request.getRecentSessions(
          this.snapshot.scope.workspaceId
        )) ?? [];
      if (seq !== this.historyRequestSeq) return;
      this.commit({
        history: {
          currentDoc,
          recent,
          loading: false,
          error: null,
        },
      });
    } catch (error) {
      if (seq !== this.historyRequestSeq) return;
      this.commit({
        history: {
          ...this.snapshot.history,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        },
      });
    }
  }

  private updateComposer(patch: Partial<AIChatSnapshot['composer']>) {
    this.commit({
      composer: {
        ...this.snapshot.composer,
        ...patch,
      },
    });
  }

  private updateContextState(
    patch: Partial<AIChatSnapshot['composer']['context']>
  ) {
    this.updateComposer({
      context: {
        ...this.snapshot.composer.context,
        ...patch,
      },
    });
  }

  private async getContextId() {
    const createdSession = this.snapshot.activeSessionId
      ? null
      : await this.ensureSession();
    if (createdSession) {
      this.openSessionObject(createdSession, true);
    }
    const sessionId =
      this.snapshot.activeSessionId ?? createdSession?.sessionId ?? null;
    if (!sessionId) return null;

    const cached = this.snapshot.composer.context.contextId;
    if (cached) return cached;

    const { workspaceId } = this.snapshot.scope;
    const existing = await this.options.request.context.getContextId(
      workspaceId,
      sessionId
    );
    const contextId =
      existing ??
      (await this.options.request.context.createContext(
        workspaceId,
        sessionId
      ));
    this.updateContextState({ contextId });
    return contextId;
  }

  private async addContextItem(item: AIChatContextItem) {
    const seq = ++this.contextRequestSeq;
    this.updateContextState({ loading: true, error: null });
    try {
      const contextId = await this.getContextId();
      if (!contextId) throw new Error('Context not found');

      const nextItem = await this.persistContextItem(contextId, item);
      if (seq !== this.contextRequestSeq) return;
      this.updateContextState({
        loading: false,
        items: [...this.snapshot.composer.context.items, nextItem],
      });
    } catch (error) {
      if (seq !== this.contextRequestSeq) return;
      this.updateContextState({ loading: false, error: this.toError(error) });
    }
  }

  private async removeContextItem(item: AIChatContextItem) {
    const seq = ++this.contextRequestSeq;
    this.updateContextState({ loading: true, error: null });
    try {
      const contextId = this.snapshot.composer.context.contextId;
      if (contextId) {
        await this.deleteContextItem(contextId, item);
      }
      if (seq !== this.contextRequestSeq) return;
      this.updateContextState({
        loading: false,
        items: this.snapshot.composer.context.items.filter(
          existing =>
            this.getContextItemKey(existing) !== this.getContextItemKey(item)
        ),
      });
    } catch (error) {
      if (seq !== this.contextRequestSeq) return;
      this.updateContextState({ loading: false, error: this.toError(error) });
    }
  }

  private async pollContext() {
    const seq = ++this.contextRequestSeq;
    const sessionId = this.snapshot.activeSessionId;
    const contextId = this.snapshot.composer.context.contextId;
    if (!sessionId || !contextId) return;

    this.updateContextState({ polling: true, error: null });
    try {
      const context = await this.options.request.context.getContextDocsAndFiles(
        this.snapshot.scope.workspaceId,
        sessionId,
        contextId
      );
      if (seq !== this.contextRequestSeq) return;
      this.updateContextState({
        polling: false,
        items: this.mergePolledContextItems(context),
        embeddingCount: this.getContextEmbeddingCount(context),
      });
    } catch (error) {
      if (seq !== this.contextRequestSeq) return;
      this.updateContextState({ polling: false, error: this.toError(error) });
    }
  }

  private startContextPolling() {
    this.stopContextPolling();
    this.contextPollingAbortController = new AbortController();
    const signal = this.contextPollingAbortController.signal;
    void this.pollContextUntilIdle(signal).catch(error => {
      if (signal.aborted) return;
      this.updateContextState({ polling: false, error: this.toError(error) });
    });
  }

  private stopContextPolling() {
    this.contextPollingAbortController?.abort();
    this.contextPollingAbortController = null;
  }

  private async pollContextUntilIdle(signal: AbortSignal) {
    while (!signal.aborted) {
      await this.pollContext();
      if (signal.aborted) return;
      if (this.snapshot.composer.context.embeddingCount.processing === 0) {
        this.stopContextPolling();
        return;
      }
      await this.waitForContextPollingInterval(signal);
    }
  }

  private waitForContextPollingInterval(signal: AbortSignal) {
    return new Promise<void>(resolve => {
      const timeout = setTimeout(resolve, CONTEXT_POLLING_INTERVAL);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
    });
  }

  private async loadContext() {
    const seq = ++this.contextRequestSeq;
    const sessionId = this.snapshot.activeSessionId;
    if (!sessionId) return;

    this.updateContextState({ loading: true, error: null });
    try {
      const { workspaceId } = this.snapshot.scope;
      const contextId = await this.options.request.context.getContextId(
        workspaceId,
        sessionId
      );
      if (!contextId) {
        if (seq !== this.contextRequestSeq) return;
        this.updateContextState({
          contextId: null,
          items: [],
          loading: false,
          embeddingCount: { finished: 0, processing: 0, failed: 0 },
        });
        return;
      }
      const context = await this.options.request.context.getContextDocsAndFiles(
        workspaceId,
        sessionId,
        contextId
      );
      if (seq !== this.contextRequestSeq) return;
      this.updateContextState({
        contextId,
        loading: false,
        items: this.contextDataToItems(context),
        embeddingCount: this.getContextEmbeddingCount(context),
      });
    } catch (error) {
      if (seq !== this.contextRequestSeq) return;
      this.updateContextState({ loading: false, error: this.toError(error) });
    }
  }

  private pollEmbeddingStatus() {
    this.embeddingStatusAbortController?.abort();
    this.embeddingStatusAbortController = new AbortController();
    const signal = this.embeddingStatusAbortController.signal;
    void this.options.request.context
      .pollEmbeddingStatus(
        this.snapshot.scope.workspaceId,
        status => {
          if (signal.aborted) return;
          this.updateContextState({
            embeddingCompleted: this.isEmbeddingCompleted(status),
          });
        },
        signal
      )
      .catch(error => {
        if (signal.aborted) return;
        this.updateContextState({
          embeddingCompleted: false,
          error: this.toError(error),
        });
      });
  }

  private async persistContextItem(
    contextId: string,
    item: AIChatContextItem
  ): Promise<AIChatContextItem> {
    switch (item.kind) {
      case 'doc':
        await this.options.request.context.addContextDoc({
          contextId,
          docId: item.docId,
        });
        return item;
      case 'file': {
        const file = await this.options.request.context.addContextFile(
          item.file,
          { contextId }
        );
        return {
          ...item,
          fileId: file.id,
          blobId: file.blobId ?? item.blobId,
          state: file.status,
          createdAt: file.createdAt,
          tooltip: file.error ?? undefined,
        };
      }
      case 'tag':
        await this.options.request.context.addContextTag({
          contextId,
          tagId: item.tagId,
          docIds: item.docIds,
        });
        return item;
      case 'collection':
        await this.options.request.context.addContextCollection({
          contextId,
          collectionId: item.collectionId,
          docIds: item.docIds,
        });
        return item;
      case 'blob': {
        const blob = await this.options.request.context.addContextBlob({
          contextId,
          blobId: item.blobId,
        });
        return {
          ...item,
          state: blob.status || item.state,
          createdAt: blob.createdAt,
        };
      }
    }
  }

  private deleteContextItem(contextId: string, item: AIChatContextItem) {
    switch (item.kind) {
      case 'doc':
        return this.options.request.context.removeContextDoc({
          contextId,
          docId: item.docId,
        });
      case 'file':
        if (!item.fileId) return Promise.resolve();
        return this.options.request.context.removeContextFile({
          contextId,
          fileId: item.fileId,
        });
      case 'tag':
        return this.options.request.context.removeContextTag({
          contextId,
          tagId: item.tagId,
        });
      case 'collection':
        return this.options.request.context.removeContextCollection({
          contextId,
          collectionId: item.collectionId,
        });
      case 'blob':
        return this.options.request.context.removeContextBlob({
          contextId,
          blobId: item.blobId,
        });
    }
  }

  private mergePolledContextItems(context: unknown) {
    if (!context || typeof context !== 'object') {
      return this.snapshot.composer.context.items;
    }
    const data = context as ContextData;
    const docs = [
      ...(data.docs ?? []),
      ...(data.tags ?? []).flatMap(tag => tag.docs ?? []),
      ...(data.collections ?? []).flatMap(collection => collection.docs ?? []),
    ];

    return this.snapshot.composer.context.items.map(item => {
      if (item.kind === 'doc') {
        const doc = docs.find(
          candidate =>
            candidate.docId === item.docId || candidate.id === item.docId
        );
        return doc?.status
          ? { ...item, state: doc.status, tooltip: doc.error ?? undefined }
          : item;
      }
      if (item.kind === 'file') {
        const file = data.files?.find(
          candidate =>
            candidate.id === item.fileId ||
            candidate.blobId === item.blobId ||
            candidate.blobId === item.fileId
        );
        return file?.status
          ? { ...item, state: file.status, tooltip: file.error ?? undefined }
          : item;
      }
      if (item.kind === 'blob') {
        const blob = data.blobs?.find(
          candidate =>
            candidate.blobId === item.blobId || candidate.id === item.blobId
        );
        return blob?.status
          ? { ...item, state: blob.status, tooltip: blob.error ?? undefined }
          : item;
      }
      return item;
    });
  }

  private contextDataToItems(context: unknown): AIChatContextItem[] {
    if (!context || typeof context !== 'object') return [];
    const data = context as ContextData;
    const items: AIChatContextItem[] = [
      ...(data.docs ?? []).flatMap(doc =>
        doc.id
          ? [
              {
                kind: 'doc' as const,
                docId: doc.id,
                state: doc.status,
                createdAt: doc.createdAt ?? undefined,
                tooltip: doc.error ?? undefined,
              },
            ]
          : []
      ),
      ...(data.files ?? []).flatMap(file =>
        file.id && file.name
          ? [
              {
                kind: 'file' as const,
                file: new File([], file.name),
                fileId: file.id,
                blobId: file.blobId,
                state: file.status,
                createdAt: file.createdAt ?? undefined,
                tooltip: file.error ?? undefined,
              },
            ]
          : []
      ),
      ...(data.tags ?? []).flatMap(tag =>
        tag.id
          ? [
              {
                kind: 'tag' as const,
                tagId: tag.id,
                docIds: (tag.docs ?? []).flatMap(doc =>
                  doc.id ? [doc.id] : []
                ),
                state: 'finished',
                createdAt: tag.createdAt ?? undefined,
                tooltip: tag.error ?? undefined,
              },
            ]
          : []
      ),
      ...(data.collections ?? []).flatMap(collection =>
        collection.id
          ? [
              {
                kind: 'collection' as const,
                collectionId: collection.id,
                docIds: (collection.docs ?? []).flatMap(doc =>
                  doc.id ? [doc.id] : []
                ),
                state: 'finished',
                createdAt: collection.createdAt ?? undefined,
                tooltip: collection.error ?? undefined,
              },
            ]
          : []
      ),
      ...(data.blobs ?? []).flatMap(blob =>
        (blob.blobId ?? blob.id)
          ? [
              {
                kind: 'blob' as const,
                blobId: blob.blobId ?? blob.id ?? '',
                state: blob.status,
                createdAt: blob.createdAt ?? undefined,
                tooltip: blob.error ?? undefined,
              },
            ]
          : []
      ),
    ];
    return items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }

  private getContextEmbeddingCount(
    context: unknown
  ): AIChatSnapshot['composer']['context']['embeddingCount'] {
    const count = { finished: 0, processing: 0, failed: 0 };
    if (!context || typeof context !== 'object') return count;
    const data = context as ContextData;
    const docs = [
      ...(data.docs ?? []),
      ...(data.tags ?? []).flatMap(tag => tag.docs ?? []),
      ...(data.collections ?? []).flatMap(collection => collection.docs ?? []),
    ];
    for (const item of [
      ...docs,
      ...(data.files ?? []),
      ...(data.blobs ?? []),
    ]) {
      if (item.status) count[item.status]++;
    }
    return count;
  }

  private isEmbeddingCompleted(status: unknown) {
    if (!status || typeof status !== 'object') return false;
    const { embedded, total } = status as EmbeddingStatus;
    return embedded === total;
  }

  private getContextItemKey(item: AIChatContextItem) {
    switch (item.kind) {
      case 'doc':
        return `doc:${item.docId}`;
      case 'file':
        return `file:${item.fileId ?? item.file.name}`;
      case 'tag':
        return `tag:${item.tagId}`;
      case 'collection':
        return `collection:${item.collectionId}`;
      case 'blob':
        return `blob:${item.blobId}`;
    }
  }

  private async openSession(sessionId: string) {
    const seq = ++this.requestSeq;
    this.streamAbortController?.abort();
    const session = await this.options.request.getSession(
      this.snapshot.scope.workspaceId,
      sessionId
    );
    if (seq !== this.requestSeq) return;
    if (session) {
      this.openSessionObject(session);
    } else {
      this.commit({
        tabs: this.snapshot.tabs.filter(tab => tab.id !== sessionId),
        sessions: this.snapshot.sessions.filter(
          session => session.sessionId !== sessionId
        ),
        messages:
          this.snapshot.activeSessionId === sessionId
            ? []
            : this.snapshot.messages,
      });
    }
  }

  private openSessionObject(
    session: CopilotChatHistoryFragment,
    preserveMessages = false
  ) {
    const result = this.options.strategy.openSession(
      session,
      this.snapshot.scope
    );
    if (result.type === 'navigate') {
      this.commit({
        navigationRequest: {
          ...result.target,
          resetTabs: true,
        },
        tabs: [],
        sessions: [],
        activeSessionId: null,
        activeTabId: null,
      });
      return;
    }
    const tab = sessionToTab(result.session);
    const existing = this.snapshot.tabs.findIndex(item => item.id === tab.id);
    const tabs =
      existing === -1
        ? [...this.snapshot.tabs.filter(item => item.kind !== 'draft'), tab]
        : this.snapshot.tabs.map(item => (item.id === tab.id ? tab : item));
    const sessionExisting = this.snapshot.sessions.findIndex(
      item => item.sessionId === result.session.sessionId
    );
    const sessions =
      sessionExisting === -1
        ? [...this.snapshot.sessions, result.session]
        : this.snapshot.sessions.map(item =>
            item.sessionId === result.session.sessionId ? result.session : item
          );
    this.commit({
      tabs,
      sessions,
      activeTabId: tab.id,
      activeSessionId: result.session.sessionId,
      navigationRequest: null,
      messages: preserveMessages
        ? this.snapshot.messages
        : ((result.session.messages ?? []) as AIChatMessage[]).slice(),
    });
  }

  private async closeTab(tabId: string) {
    const tabs = this.snapshot.tabs.filter(tab => tab.id !== tabId);
    const sessions = this.snapshot.sessions.filter(
      session => session.sessionId !== tabId
    );
    if (this.snapshot.activeTabId !== tabId) {
      this.commit({ tabs, sessions });
      return;
    }
    const fallback =
      tabs.at(-1) ??
      this.options.strategy.createDraftSession(this.snapshot.scope);
    const seq = ++this.requestSeq;
    if (fallback.kind === 'session') {
      const session = await this.options.request.getSession(
        this.snapshot.scope.workspaceId,
        fallback.sessionId
      );
      if (seq !== this.requestSeq) return;
      if (session) {
        this.commit({ tabs: tabs.length ? tabs : [fallback], sessions });
        this.openSessionObject(session);
        return;
      }
    }
    this.commit({
      tabs: tabs.length ? tabs : [fallback],
      sessions,
      activeTabId: fallback.id,
      activeSessionId: fallback.kind === 'session' ? fallback.sessionId : null,
      messages: [],
    });
  }

  private async createNewSession(pinned?: boolean) {
    if (!this.snapshot.uiPolicy.canCreateNewSession) return;
    const seq = ++this.requestSeq;
    const draft = this.options.strategy.createDraftSession(this.snapshot.scope);
    const activeTabIndex = this.snapshot.tabs.findIndex(
      tab => tab.id === this.snapshot.activeTabId
    );
    const insertIndex =
      activeTabIndex === -1 ? this.snapshot.tabs.length : activeTabIndex + 1;
    const tabs = [
      ...this.snapshot.tabs.slice(0, insertIndex),
      draft,
      ...this.snapshot.tabs.slice(insertIndex),
    ];
    this.commit({
      tabs,
      sessions: this.snapshot.sessions,
      activeTabId: draft.id,
      activeSessionId: null,
      messages: [],
    });
    if (pinned) {
      const session = await this.options.strategy.createSession(
        this.snapshot.scope,
        this.options.request,
        { pinned }
      );
      if (seq !== this.requestSeq) return;
      if (session) this.openSessionObject(session);
    }
  }

  private async togglePinActiveSession() {
    const activeSessionId = this.snapshot.activeSessionId;
    if (!activeSessionId) return;
    const active = this.snapshot.tabs.find(
      tab => tab.kind === 'session' && tab.sessionId === activeSessionId
    );
    if (!active || active.kind !== 'session') return;
    const nextPinned = !active.pinned;
    await this.options.request.updateSession({
      sessionId: activeSessionId,
      pinned: nextPinned,
    });
    this.commit({
      tabs: this.snapshot.tabs.map(tab =>
        tab.kind === 'session' && tab.sessionId === activeSessionId
          ? { ...tab, pinned: nextPinned }
          : tab
      ),
      sessions: this.snapshot.sessions.map(session =>
        session.sessionId === activeSessionId
          ? { ...session, pinned: nextPinned }
          : session
      ),
    });
  }

  private async deleteSession(sessionId: string) {
    await this.options.request.cleanupSessions({
      workspaceId: this.snapshot.scope.workspaceId,
      docId:
        'docId' in this.snapshot.scope ? this.snapshot.scope.docId : undefined,
      sessionIds: [sessionId],
    });
    await this.closeTab(sessionId);
  }

  private async bindActiveSessionToDoc() {
    if (this.snapshot.scope.kind !== 'doc' || !this.snapshot.activeSessionId) {
      return;
    }
    const active = this.snapshot.sessions.find(
      session => session.sessionId === this.snapshot.activeSessionId
    );
    if (!active || active.docId === this.snapshot.scope.docId) {
      return;
    }
    await this.options.request.updateSession({
      sessionId: active.sessionId,
      docId: this.snapshot.scope.docId,
    });
    const session = await this.options.request.getSession(
      this.snapshot.scope.workspaceId,
      active.sessionId
    );
    if (session) {
      this.openSessionObject(session, true);
    }
  }

  private createMessage(
    role: AIChatMessage['role'],
    content: string,
    options: Partial<AIChatMessage> = {}
  ): AIChatMessage {
    return {
      id: '',
      role,
      content,
      createdAt: new Date().toISOString(),
      ...options,
    };
  }

  private appendAssistantContent(content: string) {
    const messages = this.snapshot.messages.slice();
    const last = messages.at(-1);
    if (last?.role === 'assistant') {
      const streamObject = this.parseStreamObject(content);
      messages[messages.length - 1] = {
        ...last,
        ...(streamObject
          ? {
              streamObjects: this.mergeStreamObjects([
                ...(last.streamObjects ?? []),
                streamObject,
              ]),
            }
          : { content: last.content + content }),
      };
    }
    this.commit({ messages });
  }

  private parseStreamObject(content: string): unknown | null {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        'type' in parsed &&
        typeof (parsed as { type?: unknown }).type === 'string'
      ) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }

  private mergeStreamObjects(chunks: unknown[]): unknown[] {
    return chunks.reduce<unknown[]>((acc, curr) => {
      if (!curr || typeof curr !== 'object' || !('type' in curr)) {
        return acc;
      }
      const current = curr as {
        type: string;
        textDelta?: string;
        toolCallId?: string;
        toolName?: string;
      };
      const previous = acc.at(-1) as
        | {
            type?: string;
            textDelta?: string;
          }
        | undefined;
      if (
        (current.type === 'reasoning' || current.type === 'text-delta') &&
        previous?.type === current.type
      ) {
        acc[acc.length - 1] = {
          ...previous,
          textDelta: `${previous.textDelta ?? ''}${current.textDelta ?? ''}`,
        };
        return acc;
      }
      if (current.type === 'tool-result') {
        const index = acc.findIndex(item => {
          if (!item || typeof item !== 'object') return false;
          const existing = item as {
            type?: string;
            toolCallId?: string;
            toolName?: string;
          };
          return (
            existing.type === 'tool-call' &&
            existing.toolCallId === current.toolCallId &&
            existing.toolName === current.toolName
          );
        });
        if (index !== -1) {
          acc[index] = curr;
          return acc;
        }
      }
      acc.push(curr);
      return acc;
    }, []);
  }

  private async refreshLastMessageId(sessionId: string | null) {
    if (!sessionId) return;
    const last = this.snapshot.messages.at(-1);
    if (!last || last.id) return;
    const historyIds = await this.options.request.histories.ids(
      this.snapshot.scope.workspaceId,
      'docId' in this.snapshot.scope ? this.snapshot.scope.docId : undefined,
      { sessionId, withMessages: true }
    );
    const lastId = historyIds?.[0]?.messages?.at(-1)?.id;
    if (!lastId) return;
    const messages = this.snapshot.messages.slice();
    messages[messages.length - 1] = {
      ...last,
      id: lastId,
    };
    this.commit({ messages });
  }

  private toError(error: unknown) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
