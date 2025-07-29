import type { AIToolsConfigService } from '@affine/core/modules/ai-button';
import type { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { AppThemeService } from '@affine/core/modules/theme';
import type { CopilotChatHistoryFragment } from '@affine/graphql';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { type NotificationService } from '@blocksuite/affine/shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { ExtensionType, Store } from '@blocksuite/affine/store';
import { CenterPeekIcon } from '@blocksuite/icons/lit';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import type { SearchMenuConfig } from '../components/ai-chat-add-context';
import type { DocDisplayConfig } from '../components/ai-chat-chips';
import type {
  AINetworkSearchConfig,
  AIPlaygroundConfig,
  AIReasoningConfig,
} from '../components/ai-chat-input';
import type { ChatStatus } from '../components/ai-chat-messages';
import { createPlaygroundModal } from '../components/playground/modal';
import type { AppSidebarConfig } from './chat-config';

export class AIChatPanelTitle extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .ai-chat-panel-title {
      background: var(--affine-background-primary-color);
      position: relative;
      padding: 8px var(--h-padding, 16px);
      width: 100%;
      height: 36px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 1;

      svg {
        width: 18px;
        height: 18px;
        color: var(--affine-text-secondary-color);
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

  @property({ attribute: false })
  accessor affineThemeService!: AppThemeService;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor aiToolsConfigService!: AIToolsConfigService;

  @property({ attribute: false })
  accessor session!: CopilotChatHistoryFragment | null | undefined;

  @property({ attribute: false })
  accessor status!: ChatStatus;

  @property({ attribute: false })
  accessor embeddingProgress: [number, number] = [0, 0];

  @property({ attribute: false })
  accessor newSession!: () => void;

  @property({ attribute: false })
  accessor togglePin!: () => void;

  @property({ attribute: false })
  accessor openSession!: (sessionId: string) => void;

  @property({ attribute: false })
  accessor openDoc!: (docId: string, sessionId: string) => void;

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
        .affineThemeService=${this.affineThemeService}
        .notificationService=${this.notificationService}
        .affineWorkspaceDialogService=${this.affineWorkspaceDialogService}
        .aiToolsConfigService=${this.aiToolsConfigService}
      ></playground-content>
    `;

    createPlaygroundModal(playgroundContent, 'AI Playground');
  };

  override render() {
    const [done, total] = this.embeddingProgress;
    const isEmbedding = total > 0 && done < total;

    return html`
      <div class="ai-chat-panel-title">
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
        <ai-chat-toolbar
          .session=${this.session}
          .workspaceId=${this.doc.workspace.id}
          .docId=${this.doc.id}
          .status=${this.status}
          .onNewSession=${this.newSession}
          .onTogglePin=${this.togglePin}
          .onOpenSession=${this.openSession}
          .onOpenDoc=${this.openDoc}
          .docDisplayConfig=${this.docDisplayConfig}
          .notificationService=${this.notificationService}
        ></ai-chat-toolbar>
      </div>
    `;
  }
}
