import type { AIToolsConfigService } from '@affine/core/modules/ai-button';
import type { ServerService } from '@affine/core/modules/cloud';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { AppThemeService } from '@affine/core/modules/theme';
import type { CopilotChatHistoryFragment } from '@affine/graphql';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { ExtensionType, Store } from '@blocksuite/affine/store';
import type { NotificationService } from '@blocksuite/affine-shared/services';
import { css, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import type { AppSidebarConfig } from '../../chat-panel/chat-config';
import { AIProvider } from '../../provider';
import type { SearchMenuConfig } from '../ai-chat-add-context';
import type { DocDisplayConfig } from '../ai-chat-chips';
import type {
  AINetworkSearchConfig,
  AIPlaygroundConfig,
  AIReasoningConfig,
} from '../ai-chat-input';

export class PlaygroundContent extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    playground-content {
      .playground-content {
        display: flex;
        gap: 16px;
        width: 100%;
        height: 100%;
        padding: 16px;
        box-sizing: border-box;
      }

      .playground-chat-item {
        flex: 1;
        min-width: 0;
        border: 1px solid var(--affine-border-color);
        border-radius: 8px;
        background: var(--affine-background-primary-color);
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        transition: box-shadow 0.2s ease;
      }

      .playground-chat-item:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .playground-chat-item:only-child {
        max-width: 800px;
        margin: 0 auto;
      }
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor doc!: Store;

  @property({ attribute: false })
  accessor networkSearchConfig!: AINetworkSearchConfig;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor playgroundConfig!: AIPlaygroundConfig;

  @property({ attribute: false })
  accessor appSidebarConfig!: AppSidebarConfig;

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
  accessor affineThemeService!: AppThemeService;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor aiToolsConfigService!: AIToolsConfigService;

  @state()
  accessor sessions: CopilotChatHistoryFragment[] = [];

  @state()
  accessor sharedInputValue: string = '';

  private rootSessionId: string | undefined = undefined;

  private isUpdatingTextareas = false;

  private isSending = false;

  private readonly getSessions = async () => {
    const sessions =
      (await AIProvider.session?.getSessions(
        this.doc.workspace.id,
        this.doc.id,
        { action: false }
      )) || [];
    const rootSession = sessions?.findLast(session => !session.parentSessionId);
    if (!rootSession) {
      // Create a new session
      const rootSessionId = await AIProvider.session?.createSession({
        docId: this.doc.id,
        workspaceId: this.doc.workspace.id,
        promptName: 'Chat With AFFiNE AI',
      });
      if (rootSessionId) {
        this.rootSessionId = rootSessionId;
        const forkSession = await this.forkSession(rootSessionId);
        if (forkSession) {
          this.sessions = [forkSession];
        }
      }
    } else {
      this.rootSessionId = rootSession.sessionId;
      const childSessions = sessions.filter(
        session => session.parentSessionId === rootSession.sessionId
      );
      if (childSessions.length > 0) {
        this.sessions = childSessions;
      } else {
        const forkSession = await this.forkSession(rootSession.sessionId);
        if (forkSession) {
          this.sessions = [forkSession];
        }
      }
    }
  };

  private readonly forkSession = async (parentSessionId: string) => {
    const forkSessionId = await AIProvider.forkChat?.({
      workspaceId: this.doc.workspace.id,
      docId: this.doc.id,
      sessionId: parentSessionId,
      latestMessageId: '',
    });
    if (!forkSessionId) {
      return;
    }
    return await AIProvider.session?.getSession(
      this.doc.workspace.id,
      forkSessionId
    );
  };

  private readonly addChat = async () => {
    if (!this.rootSessionId) {
      return;
    }
    const forkSession = await this.forkSession(this.rootSessionId);
    if (forkSession) {
      this.sessions = [...this.sessions, forkSession];
    }
  };

  private setupTextareaSync() {
    const observer = new MutationObserver(() => {
      this.syncAllTextareas();
      this.syncAllSendButtons();
    });
    observer.observe(this, {
      childList: true,
      subtree: true,
    });
    this._disposables.add(() => observer.disconnect());
    this.syncAllTextareas();
    this.syncAllSendButtons();
  }

  private syncAllTextareas() {
    const textareas = this.getAllTextareas();
    textareas.forEach(textarea => {
      this.setupTextareaListeners(textarea);
    });
  }

  private getAllTextareas(): HTMLTextAreaElement[] {
    return Array.from(
      this.querySelectorAll(
        'ai-chat-input textarea[data-testid="chat-panel-input"]'
      )
    ) as HTMLTextAreaElement[];
  }

  private setupTextareaListeners(textarea: HTMLTextAreaElement) {
    if (textarea.dataset.synced) return;

    textarea.dataset.synced = 'true';

    const handleInput = (event: Event) => {
      if (this.isUpdatingTextareas) return;

      const target = event.target as HTMLTextAreaElement;
      const newValue = target.value;

      if (newValue !== this.sharedInputValue) {
        this.sharedInputValue = newValue;
        this.updateOtherTextareas(target, newValue);
      }
    };

    // paste need delay to ensure the content is fully processed
    const handlePaste = (event: ClipboardEvent) => {
      if (this.isUpdatingTextareas) return;

      const target = event.target as HTMLTextAreaElement;
      setTimeout(() => {
        const newValue = target.value;
        if (newValue !== this.sharedInputValue) {
          this.sharedInputValue = newValue;
          this.updateOtherTextareas(target, newValue);
        }
      }, 0);
    };

    textarea.addEventListener('input', handleInput);
    textarea.addEventListener('paste', handlePaste);

    this._disposables.add(() => {
      textarea.removeEventListener('input', handleInput);
      textarea.removeEventListener('paste', handlePaste);
    });
  }

  private updateOtherTextareas(
    sourceTextarea: HTMLTextAreaElement,
    newValue: string
  ) {
    this.isUpdatingTextareas = true;

    const textareas = this.getAllTextareas();
    textareas.forEach(textarea => {
      if (textarea !== sourceTextarea && textarea.value !== newValue) {
        textarea.value = newValue;
        this.triggerInputEvent(textarea);
      }
    });

    this.isUpdatingTextareas = false;
  }

  private triggerInputEvent(textarea: HTMLTextAreaElement) {
    const inputEvent = new Event('input', { bubbles: true });
    textarea.dispatchEvent(inputEvent);
  }

  private syncAllSendButtons() {
    const sendButtons = this.getAllSendButtons();
    sendButtons.forEach(button => {
      this.setupSendButtonListener(button);
    });
  }

  private getAllSendButtons(): HTMLElement[] {
    return Array.from(
      this.querySelectorAll('[data-testid="chat-panel-send"]')
    ) as HTMLElement[];
  }

  private setupSendButtonListener(button: HTMLElement) {
    if (button.dataset.syncSetup) return;

    button.dataset.syncSetup = 'true';

    const handleSendClick = async (_event: MouseEvent) => {
      if (this.isSending) {
        return;
      }
      this.isSending = true;
      try {
        await this.triggerOtherSendButtons(button);
      } finally {
        this.isSending = false;
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    button.addEventListener('click', handleSendClick);

    this._disposables.add(() => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      button.removeEventListener('click', handleSendClick);
    });
  }

  private async triggerOtherSendButtons(sourceButton: HTMLElement) {
    const allSendButtons = this.getAllSendButtons();
    const otherButtons = allSendButtons.filter(
      button => button !== sourceButton
    );

    const clickPromises = otherButtons.map(async button => {
      try {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        });

        button.dispatchEvent(clickEvent);
      } catch (error) {
        console.error(error);
      }
    });

    await Promise.allSettled(clickPromises);
  }

  override connectedCallback() {
    super.connectedCallback();
    this.getSessions().catch(console.error);
    this.setupTextareaSync();
  }

  override render() {
    return html`
      <div class="playground-content">
        ${repeat(
          this.sessions,
          session => session.sessionId,
          session => html`
            <div class="playground-chat-item">
              <playground-chat
                .host=${this.host}
                .doc=${this.doc}
                .session=${session}
                .networkSearchConfig=${this.networkSearchConfig}
                .reasoningConfig=${this.reasoningConfig}
                .playgroundConfig=${this.playgroundConfig}
                .appSidebarConfig=${this.appSidebarConfig}
                .searchMenuConfig=${this.searchMenuConfig}
                .docDisplayConfig=${this.docDisplayConfig}
                .extensions=${this.extensions}
                .serverService=${this.serverService}
                .affineFeatureFlagService=${this.affineFeatureFlagService}
                .affineThemeService=${this.affineThemeService}
                .notificationService=${this.notificationService}
                .aiToolsConfigService=${this.aiToolsConfigService}
                .addChat=${this.addChat}
              ></playground-chat>
            </div>
          `
        )}
      </div>
    `;
  }
}
