import type { AIToolsConfigService } from '@affine/core/modules/ai-button';
import type {
  AIModelExecutionPreference,
  AIModelService,
} from '@affine/core/modules/ai-button/services/models';
import type {
  ServerService,
  SubscriptionService,
} from '@affine/core/modules/cloud';
import { apis } from '@affine/electron-api';
import {
  type CopilotChatHistoryFragment,
  ServerDeploymentType,
  SubscriptionStatus,
} from '@affine/graphql';
import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine/components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import type { NotificationService } from '@blocksuite/affine-shared/services';
import {
  AiOutlineIcon,
  ArrowDownSmallIcon,
  CloudWorkspaceIcon,
  DoneIcon,
  LockIcon,
  ThinkingIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { autoPlacement, offset, shift } from '@floating-ui/dom';
import { computed } from '@preact/signals-core';
import { css, html } from 'lit';
import { property, state } from 'lit/decorators.js';

const modelSubMenuMiddleware = [
  autoPlacement({ allowedPlacements: ['right-start', 'left-start'] }),
  offset({ mainAxis: 4, crossAxis: 0 }),
  shift({ crossAxis: true, padding: 8 }),
];

export class ChatInputPreference extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .chat-input-preference-trigger {
      display: flex;
      align-items: center;
      padding: 0px 4px;
      color: var(--affine-v2-icon-primary);
      transition: all 0.23s ease;
      border-radius: 4px;
      background: transparent;
      border: none;
      cursor: pointer;
    }
    .chat-input-preference-trigger:hover {
      background-color: var(--affine-v2-layer-background-hoverOverlay);
    }
    .chat-input-preference-trigger-label {
      font-size: 14px;
      line-height: 22px;
      font-weight: 500;
      padding: 0px 4px;
    }
    .chat-input-preference-trigger-icon {
      font-size: 20px;
      line-height: 0;
    }
    .preference-action {
      white-space: nowrap;
      min-width: 220px;
    }
    .ai-active-model-name {
      font-size: 14px;
      color: ${unsafeCSSVarV2('text/secondary')};
      line-height: 22px;
      margin-left: 40px;
    }
    .ai-model-prefix {
      width: 20px;
      height: 20px;
    }
    .ai-model-prefix svg {
      color: ${unsafeCSSVarV2('icon/activated')};
    }
    .ai-model-postfix svg:hover {
      color: ${unsafeCSSVarV2('icon/activated')};
    }
    .ai-model-version {
      font-size: 12px;
      color: ${unsafeCSSVarV2('text/tertiary')};
      line-height: 20px;
      margin-right: 40px;
    }
  `;

  @property({ attribute: false })
  accessor session!: CopilotChatHistoryFragment | null | undefined;
  // --------- model props end ---------

  // --------- extended thinking props start ---------
  @property({ attribute: false })
  accessor extendedThinking: boolean = false;

  @property({ attribute: false })
  accessor onExtendedThinkingChange:
    | ((extendedThinking: boolean) => void)
    | undefined;
  // --------- extended thinking props end ---------

  @property({ attribute: false })
  accessor serverService!: ServerService;

  @property({ attribute: false })
  accessor toolsConfigService!: AIToolsConfigService;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor subscriptionService!: SubscriptionService;

  @property({ attribute: false })
  accessor aiModelService!: AIModelService;

  @property({ attribute: false })
  accessor onAISubscribe!: () => Promise<void>;

  @state()
  accessor localStatusLabel = '';

  model = computed(() => {
    return this.aiModelService.getActiveModel(
      this.aiModelService.modelId.value
    );
  });

  override connectedCallback() {
    super.connectedCallback();
    this.refreshLocalStatus().catch(() => {});
  }

  private getExecutionPreference(modelId?: string): AIModelExecutionPreference {
    return this.aiModelService.getExecutionPreference(modelId);
  }

  private async refreshLocalStatus() {
    const model = this.model.value;
    if (!model?.localCapable) {
      this.localStatusLabel = '';
      return;
    }

    const preference = this.getExecutionPreference(model.id);
    if (preference === 'cloud') {
      this.localStatusLabel = 'Cloud';
      return;
    }

    try {
      const [runtimeStatus, downloadStatus] = await Promise.all([
        apis?.localAI?.getStatus?.(),
        apis?.localAI?.getDownloadStatus?.(),
      ]);

      if (downloadStatus?.state === 'downloading') {
        this.localStatusLabel = `Downloading ${downloadStatus.progress}%`;
        return;
      }

      if (downloadStatus?.state === 'error') {
        this.localStatusLabel = 'Download failed';
        return;
      }

      if (
        downloadStatus?.state === 'unavailable' &&
        downloadStatus.reason === 'model_missing'
      ) {
        this.localStatusLabel = 'Download required';
        return;
      }

      if (runtimeStatus?.state === 'ready') {
        this.localStatusLabel = 'Local';
        return;
      }

      if (runtimeStatus?.state === 'starting') {
        this.localStatusLabel = 'Starting';
        return;
      }
    } catch {}

    this.localStatusLabel = 'Cloud fallback';
  }

  async openPreference(e: Event) {
    const element = e.currentTarget;
    if (!(element instanceof HTMLElement)) return;
    await this.refreshLocalStatus();
    const modelItems = [];
    const searchItems = [];

    // model switch
    modelItems.push(
      menu.subMenu({
        name: 'Model',
        prefix: AiOutlineIcon(),
        middleware: modelSubMenuMiddleware,
        postfix: html`
          <span class="ai-active-model-name">
            ${this.model.value?.name}${this.model.value?.localCapable &&
            this.localStatusLabel
              ? ` • ${this.localStatusLabel}`
              : ''}
          </span>
        `,
        options: {
          items: this.aiModelService.models.value.map(model => {
            const isSelected = model.id === this.model.value?.id;
            const isSelfHosted =
              this.serverService.server.config$.value?.type ===
              ServerDeploymentType.Selfhosted;
            const status =
              this.subscriptionService.subscription.ai$.value?.status;
            const isSubscribed = status === SubscriptionStatus.Active;
            const preference = this.getExecutionPreference(model.id);
            const localStatusInfo = model.localCapable
              ? ` • ${
                  isSelected
                    ? this.localStatusLabel ||
                      (preference === 'cloud' ? 'Cloud' : 'Cloud fallback')
                    : preference === 'cloud'
                      ? 'Cloud'
                      : 'Local'
                }`
              : '';
            return menu.action({
              name: model.category,
              info: html`
                <span class="ai-model-version"
                  >${model.version}${localStatusInfo}</span
                >
              `,
              prefix: html`
                <div class="ai-model-prefix">
                  ${isSelected ? DoneIcon() : undefined}
                </div>
              `,
              postfix: html`
                <div class="ai-model-postfix" @click=${this.onAISubscribe}>
                  ${model.isPro && !isSubscribed ? LockIcon() : undefined}
                </div>
              `,
              select: () => {
                if (model.isPro && !isSelfHosted && !isSubscribed) {
                  this.notificationService.toast(
                    `Pro models require an AFFiNE AI subscription.`
                  );
                  return;
                }
                this.aiModelService.setModel(model.id);
                this.refreshLocalStatus().catch(() => {});
              },
            });
          }),
        },
      })
    );

    if (this.model.value?.localCapable) {
      modelItems.push(
        menu.toggleSwitch({
          name: 'Use Local Gemma',
          prefix: AiOutlineIcon(),
          on: this.getExecutionPreference(this.model.value.id) === 'local',
          onChange: (value: boolean) => {
            if (!this.model.value) {
              return;
            }
            this.aiModelService.setExecutionPreference(
              this.model.value.id,
              value ? 'local' : 'cloud'
            );
            if (value) {
              apis?.localAI?.ensureReady?.().catch(() => {});
            }
            this.refreshLocalStatus().catch(() => {});
          },
          class: { 'preference-action': true },
        })
      );
    }

    modelItems.push(
      menu.toggleSwitch({
        name: 'Extended Thinking',
        prefix: ThinkingIcon(),
        on: this.extendedThinking,
        onChange: (value: boolean) => this.onExtendedThinkingChange?.(value),
        class: { 'preference-action': true },
      })
    );

    searchItems.push(
      menu.toggleSwitch({
        name: 'Workspace All Docs',
        prefix: CloudWorkspaceIcon(),
        on:
          !!this.toolsConfigService.config.value.searchWorkspace &&
          !!this.toolsConfigService.config.value.readingDocs,
        onChange: (value: boolean) =>
          this.toolsConfigService.setConfig({
            searchWorkspace: value,
            readingDocs: value,
          }),
        class: { 'preference-action': true },
      })
    );

    popMenu(popupTargetFromElement(element), {
      options: {
        items: [
          menu.group({
            items: [...modelItems],
          }),
          menu.group({
            items: [...searchItems],
          }),
        ],
        testId: 'chat-input-preference',
      },
    });
  }

  override render() {
    return html`<button
      @click=${this.openPreference}
      data-testid="chat-input-preference-trigger"
      class="chat-input-preference-trigger"
    >
      <span class="chat-input-preference-trigger-label">
        ${this.model.value?.category}
      </span>
      <span class="chat-input-preference-trigger-icon">
        ${ArrowDownSmallIcon()}
      </span>
    </button>`;
  }
}
