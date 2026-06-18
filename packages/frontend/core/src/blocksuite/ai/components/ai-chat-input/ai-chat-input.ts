import type {
  AIDraftService,
  AIToolsConfigService,
} from '@affine/core/modules/ai-button';
import type { AIModelService } from '@affine/core/modules/ai-button/services/models';
import type {
  ServerService,
  SubscriptionService,
} from '@affine/core/modules/cloud';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { CopilotChatHistoryFragment } from '@affine/graphql';
import track, { type EventArgs } from '@affine/track';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { NotificationService } from '@blocksuite/affine-shared/services';
import { ArrowUpBigIcon, CloseIcon } from '@blocksuite/icons/lit';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { ChatAbortIcon } from '../../_common/icons';
import { AIAppEvents, type AISendParams } from '../../provider';
import type { AIChatRuntime, AIChatSnapshot } from '../../runtime/chat';
import { reportResponse } from '../../utils/action-reporter';
import { readBlobAsURL } from '../../utils/image';
import type { SearchMenuConfig } from '../ai-chat-add-context';
import { addFilesToChat } from '../ai-chat-chips/attachment-utils';
import type { ChatChip, DocDisplayConfig } from '../ai-chat-chips/type';
import { isDocChip } from '../ai-chat-chips/utils';
import type { AIChatInputContext, AIReasoningConfig } from './type';

function getFirstTwoLines(text: string) {
  const lines = text.split('\n');
  return lines.slice(0, 2);
}

export class AIChatInput extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    :host {
      width: 100%;
    }

    [data-theme='dark'] .chat-panel-input {
      box-shadow:
        var(--border-shadow),
        0px 0px 0px 0px rgba(28, 158, 228, 0),
        0px 0px 0px 2px transparent;
    }
    [data-theme='light'] .chat-panel-input,
    .chat-panel-input {
      box-shadow:
        var(--border-shadow),
        0px 0px 0px 3px transparent,
        0px 2px 3px rgba(0, 0, 0, 0.05);
    }
    .chat-panel-input[data-if-focused='true'] {
      box-shadow:
        var(--border-shadow),
        0px 0px 0px 3px transparent,
        0px 4px 6px rgba(0, 0, 0, 0.05);
    }
    [data-theme='dark'] .chat-panel-input[data-if-focused='true'] {
      box-shadow:
        var(--border-shadow),
        0px 0px 0px 3px rgba(28, 158, 228, 0.3),
        0px 2px 3px rgba(0, 0, 0, 0.05);
    }

    .chat-panel-input {
      --input-border-width: 0.5px;
      --input-border-color: var(--affine-v2-layer-insideBorder-border);
      --border-shadow: 0px 0px 0px var(--input-border-width)
        var(--input-border-color);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 4px;
      position: relative;
      border-radius: 12px;
      padding: 8px 6px 6px 8px;
      min-height: 94px;
      box-sizing: border-box;
      transition: box-shadow 0.23s ease;
      background-color: var(--affine-v2-input-background);

      &[data-independent-mode='true'] {
        padding: 12px;
        border-radius: 16px;
      }

      .chat-selection-quote {
        padding: 4px 0px 8px 0px;
        padding-left: 15px;
        max-height: 56px;
        font-size: 14px;
        font-weight: 400;
        line-height: 22px;
        color: var(--affine-text-secondary-color);
        position: relative;

        div {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-quote-close {
          position: absolute;
          right: 0;
          top: 0;
          cursor: pointer;
          display: none;
          width: 16px;
          height: 16px;
          border-radius: 4px;
          border: 1px solid var(--affine-border-color);
          background-color: var(--affine-white);
        }
      }

      .chat-selection-quote:hover .chat-quote-close {
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .chat-selection-quote::after {
        content: '';
        width: 2px;
        height: calc(100% - 10px);
        margin-top: 5px;
        position: absolute;
        left: 0;
        top: 0;
        background: var(--affine-quote-color);
        border-radius: 18px;
      }
    }

    .chat-panel-input-actions {
      display: flex;
      gap: 8px;
      align-items: center;

      .chat-input-icon {
        cursor: pointer;
        padding: 2px;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 4px;

        svg {
          width: 20px;
          height: 20px;
          color: ${unsafeCSSVarV2('icon/primary')};
        }

        .chat-input-icon-label {
          font-size: 14px;
          line-height: 22px;
          font-weight: 500;
          color: ${unsafeCSSVarV2('icon/primary')};
          margin: 0 4px 0 4px;
        }
      }

      .chat-input-icon:nth-child(2) {
        margin-left: auto;
      }

      .chat-input-icon:hover {
        background-color: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
      }

      .chat-input-icon[data-active='true'] {
        background-color: #1e96eb14;

        svg {
          color: ${unsafeCSSVarV2('icon/activated')};
        }

        .chat-input-icon-label {
          color: ${unsafeCSSVarV2('icon/activated')};
        }
      }

      .chat-input-icon[aria-disabled='true'] {
        cursor: not-allowed;

        svg {
          color: ${unsafeCSSVarV2('icon/secondary')} !important;
        }
      }
    }

    .chat-panel-input {
      textarea {
        width: 100%;
        padding: 0;
        margin: 0;
        border: none;
        line-height: 22px;
        font-size: var(--affine-font-sm);
        font-weight: 400;
        font-family: var(--affine-font-family);
        color: var(--affine-text-primary-color);
        box-sizing: border-box;
        resize: none;
        overflow-y: scroll;
        background-color: transparent;
      }

      textarea::-webkit-scrollbar {
        -webkit-appearance: none;
        width: 4px;
        display: block;
      }

      textarea::-webkit-scrollbar:horizontal {
        height: 8px;
      }

      textarea::-webkit-scrollbar-thumb {
        border-radius: 2px;
        background-color: transparent;
      }

      textarea:hover::-webkit-scrollbar-thumb {
        border-radius: 16px;
        background-color: ${unsafeCSSVar('black30')};
      }

      textarea::placeholder {
        font-size: 14px;
        font-weight: 400;
        font-family: var(--affine-font-family);
        color: var(--affine-v2-text-placeholder);
      }

      textarea:focus {
        outline: none;
      }
    }

    .chat-panel-input[data-if-focused='true'] {
      --input-border-width: 1px;
      --input-border-color: var(--affine-v2-layer-insideBorder-primaryBorder);
      user-select: none;
    }

    .chat-panel-input[data-drag-over='true'] {
      --input-border-width: 1px;
      --input-border-color: var(--affine-v2-layer-insideBorder-primaryBorder);
      background-color: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
    }

    .chat-panel-input-drop-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 500;
      color: ${unsafeCSSVarV2('icon/activated')};
      background-color: color-mix(
        in srgb,
        var(--affine-v2-layer-background-primary) 92%,
        transparent
      );
      z-index: 1;
    }

    .chat-panel-send {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      border-radius: 50%;
      font-size: 20px;
      background: var(--affine-v2-icon-activated);
      color: var(--affine-v2-layer-pureWhite);
      border: none;
      padding: 0;
      cursor: pointer;
    }
    .chat-panel-send[aria-disabled='true'] {
      cursor: not-allowed;
      background: var(--affine-v2-button-disable);
    }
    .chat-panel-stop {
      cursor: pointer;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 50%;
      font-size: 24px;
      color: var(--affine-v2-icon-activated);
      border: none;
      padding: 0;
      background: transparent;
    }
    .chat-input-footer-spacer {
      flex: 1;
    }
  `;

  @property({ attribute: false })
  accessor independentMode: boolean | undefined;

  @property({ attribute: false })
  accessor host: EditorHost | null | undefined;

  @property({ attribute: false })
  accessor workspaceId!: string;

  @property({ attribute: false })
  accessor docId: string | undefined;

  @property({ attribute: false })
  accessor session!: CopilotChatHistoryFragment | null | undefined;

  @property({ attribute: false })
  accessor runtime: AIChatRuntime | null | undefined;

  @property({ attribute: false })
  accessor runtimeSnapshot: AIChatSnapshot | null | undefined;

  @property({ attribute: false })
  accessor isContextProcessing!: boolean | undefined;

  @query('image-preview-grid')
  accessor imagePreviewGrid: HTMLDivElement | null = null;

  @query('textarea')
  accessor textarea!: HTMLTextAreaElement;

  @state()
  accessor isInputEmpty = true;

  @state()
  accessor focused = false;

  @state()
  accessor isDragOver = false;

  @query('.chat-panel-input')
  accessor chatPanelInput!: HTMLDivElement;

  private _dragEnterCounter = 0;

  private _internalDropCleanup: (() => void) | null = null;

  @property({ attribute: false })
  accessor chatContextValue!: AIChatInputContext;

  @property({ attribute: false })
  accessor chips: ChatChip[] = [];

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<AIChatInputContext>) => void;

  @property({ attribute: false })
  accessor addImages!: (images: File[]) => void;

  @property({ attribute: false })
  accessor addChip!: (chip: ChatChip, silent?: boolean) => Promise<void>;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor serverService!: ServerService;

  @property({ attribute: false })
  accessor aiDraftService: AIDraftService | undefined;

  @property({ attribute: false })
  accessor aiToolsConfigService!: AIToolsConfigService;

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor subscriptionService!: SubscriptionService;

  @property({ attribute: false })
  accessor aiModelService!: AIModelService;

  @property({ attribute: false })
  accessor onAISubscribe!: () => Promise<void>;

  @property({ attribute: false })
  accessor isRootSession: boolean = true;

  @property({ attribute: false })
  accessor onChatSuccess: (() => void) | undefined;

  @property({ attribute: false })
  accessor trackOptions: BlockSuitePresets.TrackerOptions | undefined;

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId = 'chat-panel-input-container';

  @property({ attribute: false })
  accessor portalContainer: HTMLElement | null = null;

  private get _isReasoningActive() {
    return !!this.reasoningConfig.enabled.value;
  }

  override connectedCallback() {
    super.connectedCallback();

    this._disposables.add(
      AIAppEvents.requestSendWithChat.subscribe(
        (params: AISendParams | null) => {
          if (!params) {
            return;
          }
          const { input, context, host } = params;
          if (this.host === host) {
            if (context) {
              this.updateContext(context);
            }
            setTimeout(() => {
              this.send(input).catch(console.error);
            }, 0);
          }
          AIAppEvents.requestSendWithChat.next(null);
        }
      )
    );

    this._disposables.add(
      AIAppEvents.requestOpenWithChat.subscribe(params => {
        if (!params) return;

        const { input, host } = params;
        if (this.host !== host) return;

        if (input) {
          this.textarea.value = input;
          this.isInputEmpty = !this.textarea.value.trim();
        }
      })
    );

    this.updateComplete
      .then(() => {
        if (this.isConnected && !this._internalDropCleanup) {
          this._setupInternalDropTarget();
        }
      })
      .catch(console.error);

    window.addEventListener('dragleave', this._handleWindowDragLeave);
    window.addEventListener('drop', this._resetDragState);
    window.addEventListener('dragend', this._resetDragState);
  }

  protected override firstUpdated(changedProperties: PropertyValues): void {
    super.firstUpdated(changedProperties);
    if (this.aiDraftService) {
      this.aiDraftService
        .getDraft()
        .then(draft => {
          this.textarea.value = draft.input;
          this.isInputEmpty = !this.textarea.value.trim();
        })
        .catch(console.error);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._internalDropCleanup?.();
    this._internalDropCleanup = null;
    window.removeEventListener('dragleave', this._handleWindowDragLeave);
    window.removeEventListener('drop', this._resetDragState);
    window.removeEventListener('dragend', this._resetDragState);
  }

  private _trackDragDrop(method: EventArgs['addEmbeddingDoc']['method']) {
    const page = this.independentMode
      ? track.$.intelligence
      : track.$.chatPanel;
    page.chatPanelInput.addEmbeddingDoc({
      control: 'dragDrop',
      method,
    });
  }

  private _setupInternalDropTarget() {
    const el = this.chatPanelInput;
    if (!el) return;
    const dropTargetCleanup = dropTargetForElements({
      element: el,
      canDrop: ({ source }) => {
        const entity = (source.data as { entity?: { type?: string } }).entity;
        return entity?.type === 'doc';
      },
      onDragEnter: () => {
        this.isDragOver = true;
      },
      onDragLeave: () => {
        this.isDragOver = false;
      },
      onDrop: ({ source }) => {
        this.isDragOver = false;
        const entity = (
          source.data as { entity?: { type?: string; id?: string } }
        ).entity;
        if (entity?.type === 'doc' && entity.id) {
          this.addChip({
            docId: entity.id,
            state: 'processing',
          }).catch(console.error);
          this._trackDragDrop('doc');
        }
      },
    });
    this._internalDropCleanup = combine(dropTargetCleanup);
  }

  protected override render() {
    const { images } = this.chatContextValue;
    const status = this.runtimeSnapshot?.status ?? this.chatContextValue.status;
    const hasImages = images.length > 0;
    const maxHeight = hasImages ? 272 + 2 : 200 + 2;

    return html`<div
      class="chat-panel-input"
      data-independent-mode=${this.independentMode}
      data-if-focused=${this.focused}
      data-drag-over=${this.isDragOver}
      style=${styleMap({
        maxHeight: `${maxHeight}px !important`,
      })}
      @pointerdown=${this._handlePointerDown}
      @dragenter=${this._handleDragEnter}
      @dragover=${this._handleDragOver}
      @dragleave=${this._handleDragLeave}
      @drop=${this._handleDrop}
    >
      ${this.isDragOver
        ? html`<div class="chat-panel-input-drop-overlay">Drop to attach</div>`
        : nothing}
      ${hasImages
        ? html`
            <image-preview-grid
              .images=${images}
              .onImageRemove=${this._handleImageRemove}
            ></image-preview-grid>
          `
        : nothing}
      ${this.chatContextValue.quote
        ? html`<div
            class="chat-selection-quote"
            data-testid="chat-selection-quote"
          >
            ${repeat(
              getFirstTwoLines(this.chatContextValue.quote),
              line => line,
              line => html`<div>${line}</div>`
            )}
            <div
              class="chat-quote-close"
              @click=${() => {
                this.updateContext({ quote: '', markdown: '' });
              }}
            >
              ${CloseIcon()}
            </div>
          </div>`
        : nothing}
      <textarea
        rows="1"
        placeholder="What are your thoughts?"
        @input=${this._handleInput}
        @keydown=${this._handleKeyDown}
        @focus=${() => {
          this.focused = true;
        }}
        @blur=${() => {
          this.focused = false;
        }}
        @paste=${this._handlePaste}
        data-testid="chat-panel-input"
      ></textarea>
      <div class="chat-panel-input-actions">
        <div class="chat-input-icon">
          <ai-chat-add-context
            .docId=${this.docId}
            .independentMode=${this.independentMode}
            .addChip=${this.addChip}
            .addImages=${this.addImages}
            .docDisplayConfig=${this.docDisplayConfig}
            .searchMenuConfig=${this.searchMenuConfig}
            .portalContainer=${this.portalContainer}
          ></ai-chat-add-context>
        </div>
        <div class="chat-input-footer-spacer"></div>
        <chat-input-preference
          .session=${this.session}
          .extendedThinking=${this._isReasoningActive}
          .onExtendedThinkingChange=${this._toggleReasoning}
          .serverService=${this.serverService}
          .toolsConfigService=${this.aiToolsConfigService}
          .notificationService=${this.notificationService}
          .subscriptionService=${this.subscriptionService}
          .aiModelService=${this.aiModelService}
          .onAISubscribe=${this.onAISubscribe}
        ></chat-input-preference>
        ${status === 'transmitting' || status === 'loading'
          ? html`<button
              class="chat-panel-stop"
              @click=${this._handleAbort}
              data-testid="chat-panel-stop"
            >
              ${ChatAbortIcon}
            </button>`
          : html`<button
              @click="${this._onTextareaSend}"
              class="chat-panel-send"
              aria-disabled=${this.isSendDisabled}
              data-testid="chat-panel-send"
            >
              ${ArrowUpBigIcon()}
            </button>`}
      </div>
    </div>`;
  }

  private get isSendDisabled() {
    if (this.isInputEmpty) {
      return true;
    }

    if (this.runtimeSnapshot && !this.runtimeSnapshot.uiPolicy.canSend) {
      return true;
    }

    if (this.isContextProcessing) {
      return true;
    }

    return false;
  }

  private readonly _handlePointerDown = (e: MouseEvent) => {
    if (e.target !== this.textarea) {
      // by default the div will be focused and will blur the textarea
      e.preventDefault();
      this.textarea.focus();
    }
  };

  private readonly _handleInput = async () => {
    const { textarea } = this;
    const value = textarea.value.trim();
    this.isInputEmpty = !value;

    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    let imagesHeight = this.imagePreviewGrid?.scrollHeight ?? 0;
    if (imagesHeight) imagesHeight += 12;
    if (this.scrollHeight >= 200 + imagesHeight) {
      textarea.style.height = '148px';
      textarea.style.overflowY = 'scroll';
    }

    if (this.aiDraftService) {
      await this.aiDraftService.setDraft({
        input: value,
      });
    }
  };

  private readonly _handleKeyDown = async (evt: KeyboardEvent) => {
    if (evt.key === 'Enter' && !evt.shiftKey && !evt.isComposing) {
      await this._onTextareaSend(evt);
    }
  };

  private readonly _handlePaste = (event: ClipboardEvent) => {
    event.stopPropagation();
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const index in items) {
      const item = items[index];
      if (item.kind === 'file' && item.type.indexOf('image') >= 0) {
        const blob = item.getAsFile();
        if (!blob) continue;
        this.addImages([blob]);
      }
    }
  };

  private _dragHasFiles(event: DragEvent) {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }

  private readonly _handleDragEnter = (event: DragEvent) => {
    if (!this._dragHasFiles(event)) return;
    event.preventDefault();
    this._dragEnterCounter += 1;
    this.isDragOver = true;
  };

  private readonly _handleDragOver = (event: DragEvent) => {
    if (!this._dragHasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  private readonly _handleDragLeave = (event: DragEvent) => {
    if (!this._dragHasFiles(event)) return;
    this._dragEnterCounter = Math.max(0, this._dragEnterCounter - 1);
    if (this._dragEnterCounter === 0) {
      this.isDragOver = false;
    }
  };

  private readonly _resetDragState = () => {
    if (this._dragEnterCounter === 0 && !this.isDragOver) return;
    this._dragEnterCounter = 0;
    this.isDragOver = false;
  };

  // Covers the cases where the drag session ends without dragleave/drop firing
  // on the input (Esc-cancel, release outside window, drop on another element).
  private readonly _handleWindowDragLeave = (event: DragEvent) => {
    if (event.relatedTarget === null) this._resetDragState();
  };

  private readonly _handleDrop = async (event: DragEvent) => {
    if (!this._dragHasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    this._dragEnterCounter = 0;
    this.isDragOver = false;

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) return;

    try {
      await addFilesToChat(files, {
        addImages: this.addImages,
        addChip: this.addChip,
      });
      this._trackDragDrop('file');
    } catch (error) {
      console.error(error);
    }
  };

  private readonly _handleAbort = () => {
    if (this.runtime) {
      this.runtime.dispatch({ type: 'stop' }).catch(console.error);
      reportResponse('aborted:stop', this.host);
      return;
    }
  };

  private readonly _toggleReasoning = (extendedThinking: boolean) => {
    this.reasoningConfig.setEnabled(extendedThinking);
  };

  private readonly _handleImageRemove = (index: number) => {
    const oldImages = this.chatContextValue.images;
    const newImages = oldImages.filter((_, i) => i !== index);
    this.updateContext({ images: newImages });
  };

  private readonly _onTextareaSend = async (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const value = this.textarea.value.trim();
    if (value.length === 0) return;

    this.textarea.value = '';
    this.isInputEmpty = true;
    this.textarea.style.height = 'unset';

    if (this.aiDraftService) {
      await this.aiDraftService.setDraft({
        input: '',
      });
    }
    await this.send(value);
  };

  send = async (text: string) => {
    if (!this.runtime) return;
    const { markdown, images, snapshot, combinedElementsMarkdown, html } =
      this.chatContextValue;
    const userInput = (markdown ? `${markdown}\n` : '') + text;
    const imageAttachments = await Promise.all(
      images?.map(image => readBlobAsURL(image))
    );
    const contexts = await this._getMatchedContexts();
    const enableSendDetailedObject =
      this.affineFeatureFlagService.flags.enable_send_detailed_object_to_ai
        .value;
    const userInfo = AIAppEvents.userInfo.value;

    this.updateContext({
      images: [],
      quote: '',
      markdown: '',
    });
    await this.runtime.dispatch({
      type: 'send',
      input: userInput,
      contexts: {
        ...contexts,
        selectedSnapshot:
          snapshot && enableSendDetailedObject ? snapshot : undefined,
        selectedMarkdown:
          combinedElementsMarkdown && enableSendDetailedObject
            ? combinedElementsMarkdown
            : undefined,
        html: html || undefined,
      },
      attachments: images,
      attachmentPreviews: imageAttachments,
      isRootSession: this.isRootSession,
      where: this.trackOptions?.where,
      control: this.trackOptions?.control,
      reasoning: this._isReasoningActive,
      toolsConfig: this.aiToolsConfigService.config.value,
      modelId: this.aiModelService.modelId.value,
      userInfo: {
        userId: userInfo?.id,
        userName: userInfo?.name,
        avatarUrl: userInfo?.avatarUrl ?? undefined,
      },
    });
    this.onChatSuccess?.();
  };

  private async _getMatchedContexts() {
    const docContexts = new Map<
      string,
      { docId: string; docContent: string }
    >();

    this.chips.forEach(chip => {
      if (isDocChip(chip) && !!chip.markdown?.value) {
        docContexts.set(chip.docId, {
          docId: chip.docId,
          docContent: chip.markdown.value,
        });
      }
    });

    const docs: BlockSuitePresets.AIDocContextOption[] = Array.from(
      docContexts.values()
    ).map(doc => {
      const docMeta = this.docDisplayConfig.getDocMeta(doc.docId);
      const docTitle = this.docDisplayConfig.getTitle(doc.docId);
      const tags = docMeta?.tags
        ? docMeta.tags
            .map(tagId => this.docDisplayConfig.getTagTitle(tagId))
            .join(',')
        : '';
      return {
        docId: doc.docId,
        docContent: doc.docContent,
        docTitle,
        tags,
        createDate: docMeta?.createDate
          ? new Date(docMeta.createDate).toISOString()
          : '',
        updatedDate: docMeta?.updatedDate
          ? new Date(docMeta.updatedDate).toISOString()
          : '',
      };
    });

    return { docs, files: [] };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-chat-input': AIChatInput;
  }
}
