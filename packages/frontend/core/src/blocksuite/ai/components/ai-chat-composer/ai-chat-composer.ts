import './ai-chat-composer-tip';

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
import type { CopilotChatHistoryFragment } from '@affine/graphql';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { uuidv4 } from '@blocksuite/affine/store';
import type {
  FeatureFlagService,
  NotificationService,
} from '@blocksuite/affine-shared/services';
import { css, html, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';

import {
  AIAppEvents,
  type AIChatParams,
  type AISendParams,
} from '../../provider';
import type { AIChatRuntime, AIChatSnapshot } from '../../runtime/chat';
import type { SearchMenuConfig } from '../ai-chat-add-context';
import type {
  AttachmentChip,
  ChatChip,
  ChipState,
  CollectionChip,
  DocChip,
  DocDisplayConfig,
  FileChip,
  SelectedContextChip,
  TagChip,
} from '../ai-chat-chips';
import {
  findChipIndex,
  isAttachmentChip,
  isCollectionChip,
  isDocChip,
  isFileChip,
  isSelectedContextChip,
  isTagChip,
  omitChip,
} from '../ai-chat-chips';
import type { AIChatInputContext, AIReasoningConfig } from '../ai-chat-input';
import { MAX_IMAGE_COUNT } from '../ai-chat-input/const';

export class AIChatComposer extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .chat-panel-footer {
      margin: 8px 0px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--affine-text-secondary-color);
      font-size: 12px;
      user-select: none;
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
  accessor chatContextValue!: AIChatInputContext;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<AIChatInputContext>) => void;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor onChatSuccess: (() => void) | undefined;

  @property({ attribute: false })
  accessor trackOptions: BlockSuitePresets.TrackerOptions | undefined;

  @property({ attribute: false })
  accessor portalContainer: HTMLElement | null = null;

  @property({ attribute: false })
  accessor serverService!: ServerService;

  @property({ attribute: false })
  accessor affineWorkspaceDialogService!: WorkspaceDialogService;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor aiDraftService: AIDraftService | undefined;

  @property({ attribute: false })
  accessor aiToolsConfigService!: AIToolsConfigService;

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor subscriptionService!: SubscriptionService;

  @property({ attribute: false })
  accessor aiModelService!: AIModelService;

  @property({ attribute: false })
  accessor onAISubscribe!: () => Promise<void>;

  @state()
  accessor chips: ChatChip[] = [];

  @state()
  accessor isChipsCollapsed = false;

  @state()
  accessor embeddingCompleted = false;

  override render() {
    return html`
      <chat-panel-chips
        .chips=${this.chips}
        .isCollapsed=${this.isChipsCollapsed}
        .independentMode=${this.independentMode}
        .addChip=${this.addChip}
        .updateChip=${this.updateChip}
        .removeChip=${this.removeChip}
        .toggleCollapse=${this.toggleChipsCollapse}
        .docDisplayConfig=${this.docDisplayConfig}
        .portalContainer=${this.portalContainer}
        .addImages=${this.addImages}
      ></chat-panel-chips>
      <ai-chat-input
        .independentMode=${this.independentMode}
        .host=${this.host}
        .workspaceId=${this.workspaceId}
        .docId=${this.docId}
        .session=${this.session}
        .runtime=${this.runtime}
        .runtimeSnapshot=${this.runtimeSnapshot}
        .chips=${this.chips}
        .addChip=${this.addChip}
        .addImages=${this.addImages}
        .chatContextValue=${this.chatContextValue}
        .updateContext=${this.updateContext}
        .reasoningConfig=${this.reasoningConfig}
        .docDisplayConfig=${this.docDisplayConfig}
        .searchMenuConfig=${this.searchMenuConfig}
        .serverService=${this.serverService}
        .affineFeatureFlagService=${this.affineFeatureFlagService}
        .aiDraftService=${this.aiDraftService}
        .aiToolsConfigService=${this.aiToolsConfigService}
        .notificationService=${this.notificationService}
        .subscriptionService=${this.subscriptionService}
        .aiModelService=${this.aiModelService}
        .onAISubscribe=${this.onAISubscribe}
        .portalContainer=${this.portalContainer}
        .onChatSuccess=${this.onChatSuccess}
        .trackOptions=${this.trackOptions}
        .isContextProcessing=${this.isContextProcessing}
      ></ai-chat-input>
      <div class="chat-panel-footer">
        <ai-chat-composer-tip
          .tips=${[
            html`<span>AI outputs can be misleading or wrong</span>`,
          ].filter(Boolean)}
          .loop=${false}
        ></ai-chat-composer-tip>
      </div>
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();
    this._disposables.add(
      AIAppEvents.requestOpenWithChat.subscribe(this.beforeChatContextSend)
    );
    this._disposables.add(
      AIAppEvents.requestSendWithChat.subscribe(this.beforeChatContextSend)
    );
    this.initComposer().catch(console.error);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.runtime?.dispatch({ type: 'stopContextPolling' }).catch(console.error);
  }

  protected override willUpdate(changedProperties: PropertyValues): void {
    const previousSnapshot = changedProperties.get('runtimeSnapshot') as
      | AIChatSnapshot
      | null
      | undefined;
    if (
      changedProperties.has('runtimeSnapshot') &&
      previousSnapshot?.status !== 'loading' &&
      this.runtimeSnapshot?.status === 'loading' &&
      this.isChipsCollapsed === false
    ) {
      this.isChipsCollapsed = true;
    }
  }

  protected override updated(changedProperties: PropertyValues): void {
    if (changedProperties.has('runtimeSnapshot')) {
      this.syncChipsFromRuntimeSnapshot();
    }
  }

  private readonly beforeChatContextSend = (
    params: AISendParams | AIChatParams | null
  ) => {
    if (!params) return;

    const { context, host } = params;
    if (this.host !== host || !context) return;

    if (context) {
      this.updateContext(context);
    }
    if (
      context.docs ||
      context.attachments ||
      context.snapshot ||
      context.combinedElementsMarkdown ||
      context.html
    ) {
      // Wait for context value updated next frame
      setTimeout(() => {
        this.addSelectedContextChip().catch(console.error);
      }, 0);
    }
  };

  private get isContextProcessing() {
    return this.chips.some(chip => chip.state === 'processing');
  }

  private readonly toChipState = (state?: string): ChipState => {
    if (state === 'finished' || state === 'processing' || state === 'failed') {
      return state;
    }
    return 'processing';
  };

  private readonly runtimeItemToChip = (
    item: AIChatSnapshot['composer']['context']['items'][number]
  ): ChatChip => {
    switch (item.kind) {
      case 'doc':
        return {
          docId: item.docId,
          state: this.toChipState(item.state),
          createdAt: item.createdAt,
          tooltip: item.tooltip,
        };
      case 'file':
        return {
          file: item.file,
          fileId: item.fileId,
          blobId: item.blobId,
          state: this.toChipState(item.state),
          createdAt: item.createdAt,
          tooltip: item.tooltip,
        };
      case 'tag':
        return {
          tagId: item.tagId,
          state: this.toChipState(item.state),
          createdAt: item.createdAt,
          tooltip: item.tooltip,
        };
      case 'collection':
        return {
          collectionId: item.collectionId,
          state: this.toChipState(item.state),
          createdAt: item.createdAt,
          tooltip: item.tooltip,
        };
      case 'blob':
        return {
          sourceId: item.blobId,
          name: item.blobId,
          state: this.toChipState(item.state),
          createdAt: item.createdAt,
          tooltip: item.tooltip,
        };
    }
  };

  private readonly syncChipsFromRuntimeSnapshot = (
    snapshot = this.runtimeSnapshot
  ) => {
    const context = snapshot?.composer.context;
    if (!context) return;
    this.embeddingCompleted = context.embeddingCompleted;
    const selectedChips = this.chips.filter(isSelectedContextChip);
    this.updateChips([
      ...context.items.map(this.runtimeItemToChip),
      ...selectedChips,
    ]);
  };

  private readonly syncChipsFromRuntime = () => {
    this.syncChipsFromRuntimeSnapshot(this.runtime?.getSnapshot());
  };

  private readonly chipToContextItem = (
    chip: ChatChip
  ): AIChatSnapshot['composer']['context']['items'][number] | null => {
    if (isDocChip(chip)) {
      return { kind: 'doc', docId: chip.docId, state: chip.state };
    }
    if (isFileChip(chip)) {
      return {
        kind: 'file',
        file: chip.file,
        fileId: chip.fileId ?? undefined,
        blobId: chip.blobId ?? undefined,
        state: chip.state,
      };
    }
    if (isTagChip(chip)) {
      return {
        kind: 'tag',
        tagId: chip.tagId,
        docIds: this.docDisplayConfig.getTagPageIds(chip.tagId),
        state: chip.state,
      };
    }
    if (isCollectionChip(chip)) {
      return {
        kind: 'collection',
        collectionId: chip.collectionId,
        docIds: this.docDisplayConfig.getCollectionPageIds(chip.collectionId),
        state: chip.state,
      };
    }
    if (isAttachmentChip(chip)) {
      return { kind: 'blob', blobId: chip.sourceId, state: chip.state };
    }
    return null;
  };

  private readonly initChips = async () => {
    await this.runtime?.dispatch({ type: 'loadContext' });
    this.syncChipsFromRuntime();
  };

  private readonly updateChips = (chips: ChatChip[]) => {
    this.chips = chips;
  };

  private readonly updateChip = (
    chip: ChatChip,
    options: Partial<DocChip | FileChip>
  ) => {
    const index = findChipIndex(this.chips, chip);
    if (index === -1) {
      return;
    }
    const nextChip: ChatChip = {
      ...chip,
      ...options,
    };
    this.updateChips([
      ...this.chips.slice(0, index),
      nextChip,
      ...this.chips.slice(index + 1),
    ]);
  };

  private readonly addChip = async (
    chip: ChatChip,
    silent: boolean = false
  ) => {
    this.isChipsCollapsed = false;
    // if already exists
    const index = findChipIndex(this.chips, chip);
    if (index !== -1) {
      if (!silent) {
        this.notificationService.toast('chip already exists');
      }
      return;
    }
    this.updateChips([...this.chips, chip]);
    await this.addToContext(chip);
    await this.pollContextDocsAndFiles();
  };

  private readonly removeChip = async (chip: ChatChip) => {
    const chips = omitChip(this.chips, chip);
    this.updateChips(chips);
    await this.removeFromContext(chip);
  };

  private readonly addSelectedContextChip = async () => {
    const {
      attachments = [],
      snapshot,
      combinedElementsMarkdown,
      docs = [],
      html,
    } = this.chatContextValue;
    await this.removeSelectedContextChip();
    const chip: SelectedContextChip = {
      uuid: uuidv4(),
      snapshot,
      combinedElementsMarkdown,
      html,
      state: 'finished',
    };
    await Promise.all([
      this.addChip(chip, true),
      ...docs.map(docId =>
        this.addChip(
          {
            docId,
            state: 'processing',
          },
          true
        )
      ),
      ...attachments.map(attachment =>
        this.addChip(
          {
            sourceId: attachment.sourceId,
            name: attachment.name,
            state: 'processing',
          },
          true
        )
      ),
    ]);
  };

  private readonly removeSelectedContextChip = async () => {
    const selectedContextChip = this.chips.find(c => isSelectedContextChip(c));
    if (selectedContextChip) {
      await this.removeChip(selectedContextChip);
    }
  };

  private readonly addToContext = async (chip: ChatChip) => {
    if (isDocChip(chip)) {
      return await this.addDocToContext(chip);
    }
    if (isFileChip(chip)) {
      return await this.addFileToContext(chip);
    }
    if (isTagChip(chip)) {
      return await this.addTagToContext(chip);
    }
    if (isCollectionChip(chip)) {
      return await this.addCollectionToContext(chip);
    }
    if (isAttachmentChip(chip)) {
      return await this.addAttachmentChipToContext(chip);
    }
    return null;
  };

  private readonly addDocToContext = async (chip: DocChip) => {
    try {
      await this.runtime?.dispatch({
        type: 'addContextItem',
        item: { kind: 'doc', docId: chip.docId, state: chip.state },
      });
      this.syncChipsFromRuntime();
    } catch (e) {
      this.updateChip(chip, {
        state: 'failed',
        tooltip: e instanceof Error ? e.message : 'Add context doc error',
      });
    }
  };

  private readonly addFileToContext = async (chip: FileChip) => {
    try {
      await this.runtime?.dispatch({
        type: 'addContextItem',
        item: {
          kind: 'file',
          file: chip.file,
          fileId: chip.fileId ?? undefined,
          blobId: chip.blobId ?? undefined,
          state: chip.state,
        },
      });
      this.syncChipsFromRuntime();
    } catch (e) {
      this.updateChip(chip, {
        state: 'failed',
        tooltip: e instanceof Error ? e.message : 'Add context file error',
      });
    }
  };

  private readonly addTagToContext = async (chip: TagChip) => {
    try {
      await this.runtime?.dispatch({
        type: 'addContextItem',
        item: {
          kind: 'tag',
          tagId: chip.tagId,
          docIds: this.docDisplayConfig.getTagPageIds(chip.tagId),
          state: chip.state,
        },
      });
      this.syncChipsFromRuntime();
    } catch (e) {
      this.updateChip(chip, {
        state: 'failed',
        tooltip: e instanceof Error ? e.message : 'Add context tag error',
      });
    }
  };

  private readonly addCollectionToContext = async (chip: CollectionChip) => {
    try {
      await this.runtime?.dispatch({
        type: 'addContextItem',
        item: {
          kind: 'collection',
          collectionId: chip.collectionId,
          docIds: this.docDisplayConfig.getCollectionPageIds(chip.collectionId),
          state: chip.state,
        },
      });
      this.syncChipsFromRuntime();
    } catch (e) {
      this.updateChip(chip, {
        state: 'failed',
        tooltip:
          e instanceof Error ? e.message : 'Add context collection error',
      });
    }
  };

  private readonly addAttachmentChipToContext = async (
    chip: AttachmentChip
  ) => {
    try {
      await this.runtime?.dispatch({
        type: 'addContextItem',
        item: { kind: 'blob', blobId: chip.sourceId, state: chip.state },
      });
      this.syncChipsFromRuntime();
    } catch (e) {
      this.updateChip(chip, {
        state: 'failed',
        tooltip:
          e instanceof Error ? e.message : 'Add context attachment error',
      });
    }
  };

  private readonly removeFromContext = async (
    chip: ChatChip
  ): Promise<boolean> => {
    if (isSelectedContextChip(chip)) {
      this.updateContext({
        ...this.chatContextValue,
        snapshot: null,
        combinedElementsMarkdown: null,
      });
      return true;
    }
    const item = this.chipToContextItem(chip);
    if (!item) return true;
    try {
      await this.runtime?.dispatch({ type: 'removeContextItem', item });
      this.syncChipsFromRuntime();
      return true;
    } catch {
      return true;
    }
  };

  private readonly toggleChipsCollapse = () => {
    this.isChipsCollapsed = !this.isChipsCollapsed;
  };

  private readonly addImages = (images: File[]) => {
    const oldImages = this.chatContextValue.images;
    if (oldImages.length + images.length > MAX_IMAGE_COUNT) {
      this.notificationService.toast(
        `You can only upload up to ${MAX_IMAGE_COUNT} images`
      );
    }
    this.updateContext({
      images: [...oldImages, ...images].slice(0, MAX_IMAGE_COUNT),
    });
  };

  private readonly pollContextDocsAndFiles = async () => {
    if (!this.runtime) return;
    await this.runtime.dispatch({ type: 'startContextPolling' });
    this.syncChipsFromRuntime();
  };

  private readonly pollEmbeddingStatus = async () => {
    if (!this.runtime) return;
    await this.runtime.dispatch({ type: 'pollEmbeddingStatus' });
    this.syncChipsFromRuntime();
  };

  private readonly initComposer = async () => {
    const userId = AIAppEvents.userInfo.value?.id;
    if (!userId || !this.session) return;

    await this.initChips();
    const needPoll = this.chips.some(
      chip =>
        chip.state === 'processing' || isTagChip(chip) || isCollectionChip(chip)
    );
    if (needPoll) {
      await this.pollContextDocsAndFiles();
    }
    await this.pollEmbeddingStatus();
  };
}
