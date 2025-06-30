import type { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { ContextEmbedStatus, CopilotSessionType } from '@affine/graphql';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { ExtensionType, Store } from '@blocksuite/affine/store';
import { CenterPeekIcon } from '@blocksuite/icons/lit';
import { type Signal, signal } from '@preact/signals-core';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
import { styleMap } from 'lit/directives/style-map.js';

import type {
  DocDisplayConfig,
  SearchMenuConfig,
} from '../components/ai-chat-chips';
import type {
  AINetworkSearchConfig,
  AIPlaygroundConfig,
  AIReasoningConfig,
} from '../components/ai-chat-input';
import { createPlaygroundModal } from '../components/playground/modal';
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
      }

      .chat-panel-title-text {
        font-size: 14px;
        font-weight: 500;
        color: var(--affine-text-secondary-color);
      }

      .chat-panel-playground {
        cursor: pointer;
        padding: 2px;
        margin-left: 8px;
        margin-right: auto;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .chat-panel-playground:hover svg {
        color: ${unsafeCSSVarV2('icon/activated')};
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
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor affineWorkspaceDialogService!: WorkspaceDialogService;

  @state()
  accessor session: CopilotSessionType | null | undefined;

  @state()
  accessor embeddingProgress: [number, number] = [0, 0];

  private isSidebarOpen: Signal<boolean | undefined> = signal(false);

  private sidebarWidth: Signal<number | undefined> = signal(undefined);

  private readonly initSession = async () => {
    if (this.session) {
      return this.session;
    }
    const sessions = (
      (await AIProvider.session?.getSessions(
        this.doc.workspace.id,
        this.doc.id,
        { action: false }
      )) || []
    ).filter(session => !session.parentSessionId);
    const session = sessions.at(-1);
    this.session = session ?? null;
    return session;
  };

  private readonly createSession = async () => {
    if (this.session) {
      return this.session;
    }
    const sessionId = await AIProvider.session?.createSession({
      docId: this.doc.id,
      workspaceId: this.doc.workspace.id,
      promptName: 'Chat With AFFiNE AI',
    });
    if (sessionId) {
      const session = await AIProvider.session?.getSession(
        this.doc.workspace.id,
        sessionId
      );
      this.session = session ?? null;
    }
    return this.session;
  };

  private readonly initPanel = async () => {
    try {
      if (!this.isSidebarOpen.value) {
        return;
      }
      await this.initSession();
    } catch (error) {
      console.error(error);
    }
  };

  private readonly resetPanel = () => {
    this.session = undefined;
    this.embeddingProgress = [0, 0];
  };

  private readonly updateEmbeddingProgress = (
    count: Record<ContextEmbedStatus, number>
  ) => {
    const total = count.finished + count.processing + count.failed;
    this.embeddingProgress = [count.finished, total];
  };

  private readonly openPlayground = () => {
    const playgroundContent = html`
      <playground-content
        .host=${this.host}
        .doc=${this.doc}
        .networkSearchConfig=${this.networkSearchConfig}
        .reasoningConfig=${this.reasoningConfig}
        .playgroundConfig=${this.playgroundConfig}
        .appSidebarConfig=${this.appSidebarConfig}
        .searchMenuConfig=${this.searchMenuConfig}
        .docDisplayConfig=${this.docDisplayConfig}
        .extensions=${this.extensions}
        .affineFeatureFlagService=${this.affineFeatureFlagService}
      ></playground-content>
    `;

    createPlaygroundModal(playgroundContent, 'AI Playground');
  };

  protected override updated(changedProperties: PropertyValues) {
    if (changedProperties.has('doc')) {
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
      this.isSidebarOpen.subscribe(() => {
        if (this.session === undefined) {
          this.initPanel().catch(console.error);
        }
      })
    );
  }

  override render() {
    const isInitialized = this.session !== undefined;
    if (!isInitialized) {
      return nothing;
    }

    const width = this.sidebarWidth.value || 0;
    const style = styleMap({
      padding: width > 540 ? '8px 24px 0 24px' : '8px 12px 0 12px',
    });
    const [done, total] = this.embeddingProgress;
    const isEmbedding = total > 0 && done < total;
    const title = html`
      <div class="chat-panel-title-text">
        ${isEmbedding
          ? html`<span data-testid="chat-panel-embedding-progress"
              >Embedding ${done}/${total}</span
            >`
          : 'AFFiNE AI'}
      </div>
      ${this.playgroundConfig.visible.value
        ? html`
            <div class="chat-panel-playground" @click=${this.openPlayground}>
              ${CenterPeekIcon()}
            </div>
          `
        : nothing}
    `;

    return html`<div class="chat-panel-container" style=${style}>
      ${keyed(
        this.doc.id,
        html`<ai-chat-content
          .chatTitle=${title}
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
          .affineFeatureFlagService=${this.affineFeatureFlagService}
          .affineWorkspaceDialogService=${this.affineWorkspaceDialogService}
          .updateEmbeddingProgress=${this.updateEmbeddingProgress}
          .width=${this.sidebarWidth}
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
