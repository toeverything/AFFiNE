import type { AIToolsConfigService } from '@affine/core/modules/ai-button';
import type { AIModelService } from '@affine/core/modules/ai-button/services/models';
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
import { property } from 'lit/decorators.js';

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
      margin-left: 40px;
      color: ${unsafeCSSVarV2('text/secondary')};
      font-size: 14px;
      line-height: 22px;
    }
    .ai-model-prefix {
      width: 20px;
      height: 20px;
    }
    .ai-model-prefix svg {
      color: ${unsafeCSSVarV2('icon/activated')};
    }
    .ai-model-postfix {
      width: 20px;
      height: 20px;
    }
    .ai-model-postfix svg:hover {
      color: ${unsafeCSSVarV2('icon/activated')};
    }
    .ai-model-version {
      margin-right: 40px;
      color: ${unsafeCSSVarV2('text/tertiary')};
      font-size: 12px;
      line-height: 20px;
    }
  `;

  // --------- extended thinking props start ---------
  @property({ attribute: false })
  accessor extendedThinking: boolean = false;

  @property({ attribute: false })
  accessor onExtendedThinkingChange:
    | ((extendedThinking: boolean) => void)
    | undefined;
  // --------- extended thinking props end ---------

  @property({ attribute: false })
  accessor toolsConfigService!: AIToolsConfigService;

  @property({ attribute: false })
  accessor aiModelService!: AIModelService;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor onAISubscribe!: () => Promise<void>;

  private readonly model = computed(() =>
    this.aiModelService.models.value.find(
      model => model.id === this.aiModelService.modelId.value
    )
  );

  openPreference(e: Event) {
    const element = e.currentTarget;
    if (!(element instanceof HTMLElement)) return;
    const preferenceItems = [];
    const searchItems = [];

    if (this.aiModelService.models.value.length) {
      preferenceItems.push(
        menu.subMenu({
          name: 'Model',
          prefix: AiOutlineIcon(),
          middleware: modelSubMenuMiddleware,
          postfix: html`
            <span class="ai-active-model-name">
              ${this.model.value?.name ?? 'Auto'}
            </span>
          `,
          options: {
            items: [
              menu.action({
                name: 'Auto',
                prefix: html`
                  <div class="ai-model-prefix">
                    ${
                      this.aiModelService.modelId.value ? undefined : DoneIcon()
                    }
                  </div>
                `,
                select: () => this.aiModelService.resetModel(),
              }),
              ...this.aiModelService.models.value.map(model =>
                menu.action({
                  name: model.category,
                  info: html`
                    <span class="ai-model-version">${model.version}</span>
                  `,
                  prefix: html`
                    <div class="ai-model-prefix">
                      ${
                        model.id === this.aiModelService.modelId.value
                          ? DoneIcon()
                          : undefined
                      }
                    </div>
                  `,
                  postfix: html`
                    <div class="ai-model-postfix">
                      ${model.available ? undefined : LockIcon()}
                    </div>
                  `,
                  select: () => {
                    if (!model.available) {
                      this.notificationService.toast(
                        'This model requires an AFFiNE AI subscription.'
                      );
                      this.onAISubscribe().catch(console.error);
                      return;
                    }
                    this.aiModelService.setModel(model.id);
                  },
                })
              ),
            ],
          },
        })
      );
    }

    preferenceItems.push(
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
            items: [...preferenceItems],
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
        ${this.model.value?.category ?? 'Auto'}
      </span>
      <span class="chat-input-preference-trigger-icon">
        ${ArrowDownSmallIcon()}
      </span>
    </button>`;
  }
}
