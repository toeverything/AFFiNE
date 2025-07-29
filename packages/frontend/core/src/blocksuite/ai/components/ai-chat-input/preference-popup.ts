import type { AIToolsConfigService } from '@affine/core/modules/ai-button';
import type { CopilotChatHistoryFragment } from '@affine/graphql';
import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine/components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import {
  ArrowDownSmallIcon,
  CloudWorkspaceIcon,
  ThinkingIcon,
  WebIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';

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
  `;

  @property({ attribute: false })
  accessor session!: CopilotChatHistoryFragment | null | undefined;

  @property({ attribute: false })
  accessor onModelChange: ((modelId: string) => void) | undefined;

  @property({ attribute: false })
  accessor modelId: string | undefined = undefined;
  // --------- model props end ---------

  // --------- extended thinking props start ---------
  @property({ attribute: false })
  accessor extendedThinking: boolean = false;

  @property({ attribute: false })
  accessor onExtendedThinkingChange:
    | ((extendedThinking: boolean) => void)
    | undefined;
  // --------- extended thinking props end ---------

  // --------- search props start ---------
  @property({ attribute: false })
  accessor networkSearchVisible: boolean = false;

  @property({ attribute: false })
  accessor isNetworkActive: boolean = false;

  @property({ attribute: false })
  accessor onNetworkActiveChange:
    | ((isNetworkActive: boolean) => void)
    | undefined;
  // --------- search props end ---------

  @property({ attribute: false })
  accessor toolsConfigService!: AIToolsConfigService;

  // private readonly _onModelChange = (modelId: string) => {
  //   this.onModelChange?.(modelId);
  // };

  openPreference(e: Event) {
    const element = e.currentTarget;
    if (!(element instanceof HTMLElement)) return;
    const modelItems = [];
    const searchItems = [];

    // model switch
    // modelItems.push(
    //   menu.subMenu({
    //     name: 'Model',
    //     prefix: AiOutlineIcon(),
    //     options: {
    //       items: (this.session?.optionalModels ?? []).map(modelId => {
    //         return menu.action({
    //           name: modelId,
    //           select: () => this._onModelChange(modelId),
    //         });
    //       }),
    //     },
    //   })
    // );

    modelItems.push(
      menu.toggleSwitch({
        name: 'Extended Thinking',
        prefix: ThinkingIcon(),
        on: this.extendedThinking,
        onChange: (value: boolean) => this.onExtendedThinkingChange?.(value),
        class: { 'preference-action': true },
      })
    );

    if (this.networkSearchVisible) {
      searchItems.push(
        menu.toggleSwitch({
          name: 'Web Search',
          prefix: WebIcon(),
          on: this.isNetworkActive,
          onChange: (value: boolean) => this.onNetworkActiveChange?.(value),
          class: { 'preference-action': true },
          testId: 'chat-network-search',
        }),
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
    }

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
      <span class="chat-input-preference-trigger-label"> Claude </span>
      <span class="chat-input-preference-trigger-icon">
        ${ArrowDownSmallIcon()}
      </span>
    </button>`;
  }
}
