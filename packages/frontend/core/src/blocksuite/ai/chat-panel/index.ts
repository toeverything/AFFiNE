import type {
  AIDraftService,
  AIToolsConfigService,
} from '@affine/core/modules/ai-button';
import type { AIModelService } from '@affine/core/modules/ai-button/services/models';
import type {
  ServerService,
  SubscriptionService,
} from '@affine/core/modules/cloud';
import type { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { PeekViewService } from '@affine/core/modules/peek-view';
import type { AppThemeService } from '@affine/core/modules/theme';
import type { WorkbenchService } from '@affine/core/modules/workbench';
import type {
  ContextEmbedStatus,
  CopilotChatHistoryFragment,
  UpdateChatSessionInput,
} from '@affine/graphql';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { type NotificationService } from '@blocksuite/affine/shared/services';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { ExtensionType, Store } from '@blocksuite/affine/store';
import { type Signal, signal } from '@preact/signals-core';
import { css, html, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';

import { AffineIcon } from '../_common/icons';
import type { SearchMenuConfig } from '../components/ai-chat-add-context';
import type { DocDisplayConfig } from '../components/ai-chat-chips';
import type { ChatContextValue } from '../components/ai-chat-content';
import type {
  AINetworkSearchConfig,
  AIPlaygroundConfig,
  AIReasoningConfig,
} from '../components/ai-chat-input';
import type { ChatStatus } from '../components/ai-chat-messages';
import { AIProvider } from '../provider';
import type { AppSidebarConfig } from './chat-config';

export class ChatPanel extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    chat-panel {
      width: 100%;
      user-select: text;

      .chat-panel-container {
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      ai-chat-content {
        height: 0;
        flex-grow: 1;
      }

      .chat-loading-container {
        position: relative;
        padding: 44px 0 166px 0;
        height: 100%;
        display: flex;
        align-items: center;
      }

      .chat-loading {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }

      .chat-loading-title {
        font-weight: 600;
        font-size: var(--affine-font-sm);
        color: var(--affine-text-secondary-color);
      }
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor doc!: Store;

  @property({ attribute: false })
  accessor playgroundConfig!: AIPlaygroundConfig;

  @property({ attribute: false })
  accessor appSidebarConfig!: AppSidebarConfig;

  @property({ attribute: false })
  accessor networkSearchConfig!: AINetworkSearchConfig;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor extensions!: ExtensionType[];

  @property({ attribute: false })
  accessor serverService!: ServerService;

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor affineWorkspaceDialogService!: WorkspaceDialogService;

  @property({ attribute: false })
  accessor affineWorkbenchService!: WorkbenchService;

  @property({ attribute: false })
  accessor affineThemeService!: AppThemeService;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor aiDraftService!: AIDraftService;

  @property({ attribute: false })
  accessor aiToolsConfigService!: AIToolsConfigService;

  @property({ attribute: false })
  accessor peekViewService!: PeekViewService;

  @property({ attribute: false })
  accessor subscriptionService!: SubscriptionService;

  @property({ attribute: false })
  accessor aiModelService!: AIModelService;

  @property({ attribute: false })
  accessor onAISubscribe!: () => Promise<void>;

  @state()
  accessor session: CopilotChatHistoryFragment | null | undefined;

  @state()
  accessor embeddingProgress: [number, number] = [0, 0];

  @state()
  accessor status: ChatStatus = 'idle';

  private isSidebarOpen: Signal<boolean | undefined> = signal(false);

  private sidebarWidth: Signal<number | undefined> = signal(undefined);

  private hasPinned = false;

  private get isInitialized() {
    return this.session !== undefined;
  }

  private readonly getSessionIdFromUrl = () => {
    if (this.affineWorkbenchService) {
      const { workbench } = this.affineWorkbenchService;
      const location = workbench.location$.value;
      const searchParams = new URLSearchParams(location.search);
      const sessionId = searchParams.get('sessionId');
      if (sessionId) {
        workbench.activeView$.value.updateQueryString(
          { sessionId: undefined },
          { replace: true }
        );
      }
      return sessionId;
    }
    return undefined;
  };

  private readonly setSession = (
    session: CopilotChatHistoryFragment | null | undefined
  ) => {
    this.session = session ?? null;
  };

  private readonly initSession = async () => {
    if (!AIProvider.session) {
      return;
    }
    const sessionId = this.getSessionIdFromUrl();
    const pinSessions = await AIProvider.session.getSessions(
      this.doc.workspace.id,
      undefined,
      { pinned: true, limit: 1 }
    );

    if (Array.isArray(pinSessions) && pinSessions[0]) {
      // pinned session
      this.session = pinSessions[0];
    } else if (sessionId) {
      // sessionId from url
      const session = await AIProvider.session.getSession(
        this.doc.workspace.id,
        sessionId
      );
      this.setSession(session);
    } else {
      // latest doc session
      const docSessions = await AIProvider.session.getSessions(
        this.doc.workspace.id,
        this.doc.id,
        { action: false, fork: false, limit: 1 }
      );
      // sessions is descending ordered by updatedAt
      // the first item is the latest session
      const session = docSessions?.[0];
      this.setSession(session);
    }
  };

  private readonly createSession = async (
    options: Partial<BlockSuitePresets.AICreateSessionOptions> = {}
  ) => {
    if (this.session) {
      return this.session;
    }
    const sessionId = await AIProvider.session?.createSession({
      docId: this.doc.id,
      workspaceId: this.doc.workspace.id,
      promptName: 'Chat With AFFiNE AI',
      reuseLatestChat: false,
      ...options,
    });
    if (sessionId) {
      const session = await AIProvider.session?.getSession(
        this.doc.workspace.id,
        sessionId
      );
      this.setSession(session);
    }
    return this.session;
  };

  private readonly deleteSession = async (
    session: BlockSuitePresets.AIRecentSession
  ) => {
    if (!AIProvider.histories) {
      return;
    }
    const confirm = await this.notificationService.confirm({
      title: 'Delete this history?',
      message:
        'Do you want to delete this AI conversation history? Once deleted, it cannot be recovered.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (confirm) {
      await AIProvider.histories.cleanup(
        session.workspaceId,
        session.docId || undefined,
        [session.sessionId]
      );
      if (session.sessionId === this.session?.sessionId) {
        this.newSession();
      }
    }
  };

  private readonly updateSession = async (options: UpdateChatSessionInput) => {
    await AIProvider.session?.updateSession(options);
    const session = await AIProvider.session?.getSession(
      this.doc.workspace.id,
      options.sessionId
    );
    this.setSession(session);
  };

  private readonly newSession = () => {
    this.resetPanel();
    requestAnimationFrame(() => {
      this.session = null;
    });
  };

  private readonly openSession = async (sessionId: string) => {
    if (this.session?.sessionId === sessionId) {
      return;
    }
    this.resetPanel();
    const session = await AIProvider.session?.getSession(
      this.doc.workspace.id,
      sessionId
    );
    this.setSession(session);
  };

  private readonly openDoc = async (docId: string, sessionId: string) => {
    if (this.doc.id === docId) {
      if (this.session?.sessionId === sessionId || this.session?.pinned) {
        return;
      }
      await this.openSession(sessionId);
    } else if (this.affineWorkbenchService) {
      const { workbench } = this.affineWorkbenchService;
      if (this.session?.pinned) {
        workbench.open(`/${docId}`, { at: 'active' });
      } else {
        workbench.open(`/${docId}?sessionId=${sessionId}`, { at: 'active' });
      }
    }
  };

  private readonly togglePin = async () => {
    const pinned = !this.session?.pinned;
    this.hasPinned = true;
    if (!this.session) {
      await this.createSession({ pinned });
    } else {
      await this.updateSession({
        sessionId: this.session.sessionId,
        pinned,
      });
    }
  };

  private readonly rebindSession = async () => {
    if (!this.session) {
      return;
    }
    if (this.session.docId !== this.doc.id) {
      await this.updateSession({
        sessionId: this.session.sessionId,
        docId: this.doc.id,
      });
    }
  };

  private readonly initPanel = async () => {
    try {
      if (!this.isSidebarOpen.value) {
        return;
      }
      await this.initSession();
      this.hasPinned = !!this.session?.pinned;
    } catch (error) {
      console.error(error);
    }
  };

  private readonly resetPanel = () => {
    this.session = undefined;
    this.embeddingProgress = [0, 0];
    this.hasPinned = false;
  };

  private readonly onEmbeddingProgressChange = (
    count: Record<ContextEmbedStatus, number>
  ) => {
    const total = count.finished + count.processing + count.failed;
    this.embeddingProgress = [count.finished, total];
  };

  private readonly onContextChange = async (
    context: Partial<ChatContextValue>
  ) => {
    this.status = context.status ?? 'idle';
    if (context.status === 'success') {
      await this.rebindSession();
    }
  };

  protected override updated(changedProperties: PropertyValues) {
    if (changedProperties.has('doc')) {
      if (this.session?.pinned) {
        return;
      }
      this.resetPanel();
      this.initPanel().catch(console.error);
    }
  }

  override connectedCallback() {
    super.connectedCallback();
    if (!this.doc) throw new Error('doc is required');

    this._disposables.add(
      AIProvider.slots.userInfo.subscribe(() => {
        this.resetPanel();
        this.initPanel().catch(console.error);
      })
    );

    const isOpen = this.appSidebarConfig.isOpen();
    this.isSidebarOpen = isOpen.signal;
    this._disposables.add(isOpen.cleanup);

    const width = this.appSidebarConfig.getWidth();
    this.sidebarWidth = width.signal;
    this._disposables.add(width.cleanup);

    this._disposables.add(
      this.isSidebarOpen.subscribe(isOpen => {
        if (isOpen && !this.isInitialized) {
          this.initPanel().catch(console.error);
        }
      })
    );
  }

  override render() {
    if (!this.isInitialized) {
      return html`<div class="chat-loading-container">
        <div class="chat-loading">
          ${AffineIcon('var(--affine-icon-secondary)')}
          <div class="chat-loading-title">
            <span> AFFiNE AI is loading history... </span>
          </div>
        </div>
      </div>`;
    }

    return html`<div class="chat-panel-container">
      <ai-chat-panel-title
        .host=${this.host}
        .doc=${this.doc}
        .playgroundConfig=${this.playgroundConfig}
        .appSidebarConfig=${this.appSidebarConfig}
        .networkSearchConfig=${this.networkSearchConfig}
        .reasoningConfig=${this.reasoningConfig}
        .searchMenuConfig=${this.searchMenuConfig}
        .docDisplayConfig=${this.docDisplayConfig}
        .extensions=${this.extensions}
        .serverService=${this.serverService}
        .affineFeatureFlagService=${this.affineFeatureFlagService}
        .affineWorkspaceDialogService=${this.affineWorkspaceDialogService}
        .affineThemeService=${this.affineThemeService}
        .notificationService=${this.notificationService}
        .aiToolsConfigService=${this.aiToolsConfigService}
        .session=${this.session}
        .status=${this.status}
        .embeddingProgress=${this.embeddingProgress}
        .newSession=${this.newSession}
        .togglePin=${this.togglePin}
        .openSession=${this.openSession}
        .openDoc=${this.openDoc}
        .deleteSession=${this.deleteSession}
      ></ai-chat-panel-title>
      ${keyed(
        this.hasPinned ? this.session?.sessionId : this.doc.id,
        html`<ai-chat-content
          .host=${this.host}
          .session=${this.session}
          .createSession=${this.createSession}
          .workspaceId=${this.doc.workspace.id}
          .docId=${this.doc.id}
          .networkSearchConfig=${this.networkSearchConfig}
          .reasoningConfig=${this.reasoningConfig}
          .searchMenuConfig=${this.searchMenuConfig}
          .docDisplayConfig=${this.docDisplayConfig}
          .extensions=${this.extensions}
          .serverService=${this.serverService}
          .affineFeatureFlagService=${this.affineFeatureFlagService}
          .affineWorkspaceDialogService=${this.affineWorkspaceDialogService}
          .affineThemeService=${this.affineThemeService}
          .notificationService=${this.notificationService}
          .aiDraftService=${this.aiDraftService}
          .aiToolsConfigService=${this.aiToolsConfigService}
          .peekViewService=${this.peekViewService}
          .subscriptionService=${this.subscriptionService}
          .aiModelService=${this.aiModelService}
          .onAISubscribe=${this.onAISubscribe}
          .onEmbeddingProgressChange=${this.onEmbeddingProgressChange}
          .onContextChange=${this.onContextChange}
          .width=${this.sidebarWidth}
          .onOpenDoc=${this.openDoc}
        ></ai-chat-content>`
      )}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-panel': ChatPanel;
  }
}
