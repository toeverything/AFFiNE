import {
  CaptionedBlockComponent,
  SelectedStyle,
} from '@blocksuite/affine-components/caption';
import {
  getAttachmentFileIcon,
  LoadingIcon,
} from '@blocksuite/affine-components/icons';
import { Peekable, PeekViewProvider } from '@blocksuite/affine-components/peek';
import {
  type ResolvedStateInfo,
  ResourceController,
} from '@blocksuite/affine-components/resource';
import { toast } from '@blocksuite/affine-components/toast';
import {
  type AttachmentBlockModel,
  AttachmentBlockStyles,
} from '@blocksuite/affine-model';
import {
  BlockElementCommentManager,
  CitationProvider,
  DocModeProvider,
  FileSizeLimitProvider,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import {
  formatSize,
  openSingleFileWith,
} from '@blocksuite/affine-shared/utils';
import {
  AttachmentIcon,
  EditIcon,
  ResetIcon,
  UpgradeIcon,
  WarningIcon,
} from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';
import { nanoid, Slice } from '@blocksuite/store';
import { batch, computed, signal } from '@preact/signals-core';
import { html, type TemplateResult } from 'lit';
import { choose } from 'lit/directives/choose.js';
import { type ClassInfo, classMap } from 'lit/directives/class-map.js';
import { guard } from 'lit/directives/guard.js';
import { styleMap } from 'lit/directives/style-map.js';
import { when } from 'lit/directives/when.js';
import { filter } from 'rxjs/operators';

import { AttachmentEmbedProvider } from './embed';
import { styles } from './styles';
import { dispatchAttachmentTrashEvent } from './trash';
import {
  downloadAttachmentBlob,
  getFileType,
  isAttachmentEditable,
  refreshData,
} from './utils';

type AttachmentResolvedStateInfo = ResolvedStateInfo & {
  kind?: TemplateResult;
};

@Peekable({
  enableOn: ({ model }: AttachmentBlockComponent) => {
    return !model.store.readonly && model.props.type.endsWith('pdf');
  },
})
export class AttachmentBlockComponent extends CaptionedBlockComponent<AttachmentBlockModel> {
  static override styles = styles;

  blockDraggable = true;

  resourceController = new ResourceController(
    computed(() => this.model.props.sourceId$.value)
  );

  // Store parent info early for trash functionality
  // Note: Currently cached but not actively used - reserved for future trash restoration features
  // private _cachedParentInfo: {
  //   parentId: string | null;
  //   prevId: string | null;
  //   nextId: string | null;
  // } | null = null;

  get blobUrl() {
    return this.resourceController.blobUrl$.value;
  }

  get filetype() {
    const name = this.model.props.name$.value;
    return name.split('.').pop() ?? '';
  }

  protected containerStyleMap = styleMap({
    position: 'relative',
    width: '100%',
    margin: '18px 0px',
  });

  private get _maxFileSize() {
    return this.std.get(FileSizeLimitProvider).maxFileSize;
  }

  get citationService() {
    return this.std.get(CitationProvider);
  }

  get isCitation() {
    return this.citationService.isCitationModel(this.model);
  }

  get isCommentHighlighted() {
    return (
      this.std
        .getOptional(BlockElementCommentManager)
        ?.isBlockCommentHighlighted(this.model) ?? false
    );
  }

  convertTo = () => {
    return this.std
      .get(AttachmentEmbedProvider)
      .convertTo(this.model, this._maxFileSize);
  };

  edit = async () => {
    try {
      const module = await import('./editor.js');
      if (module?.openAttachmentEditor) {
        await module.openAttachmentEditor(this);
      } else {
        console.error('Attachment editor module not available');
        toast(this.host, 'Editor not available');
      }
    } catch (error) {
      console.error('Failed to open attachment editor:', error);
      toast(this.host, 'Failed to open editor');
    }
  };

  copy = () => {
    const slice = Slice.fromModels(this.store, [this.model]);
    this.std.clipboard.copySlice(slice).catch(console.error);
    toast(this.host, 'Copied to clipboard');
  };

  download = () => {
    downloadAttachmentBlob(this);
  };

  embedded = () => {
    return (
      Boolean(this.blobUrl) &&
      this.std
        .get(AttachmentEmbedProvider)
        .embedded(this.model, this._maxFileSize)
    );
  };

  openExternal = async () => {
    const blobUrl = this.blobUrl;
    if (!blobUrl) return;

    // Check if Electron API is available for opening temp files
    if ((window as any).__apis?.file?.openTempFile) {
      try {
        const blob = await this.resourceController.blob();
        if (blob) {
          const buffer = new Uint8Array(await blob.arrayBuffer());
          await (window as any).__apis.file.openTempFile(
            Array.from(buffer),
            this.model.props.name$.value
          );
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }

    window.open(blobUrl, '_blank');
  };

  openPreview = async () => {
    const peekView = this.std.getOptional(PeekViewProvider);
    if (!peekView) return;
    await peekView.peek({
      docId: this.model.store.id,
      blockIds: [this.blockId],
      target: this,
    });
  };

  // Refreshes data.
  refreshData = () => {
    refreshData(this).catch(console.error);
  };

  private readonly _refreshKey$ = signal<string | null>(null);

  // Refreshes the embed component.
  reload = () => {
    batch(() => {
      if (this.model.props.embed$.value) {
        this._refreshKey$.value = nanoid();
        return;
      }

      this.refreshData();
    });
  };

  // Replaces the current attachment.
  replace = async () => {
    const state = this.resourceController.state$.peek();
    if (state.uploading) return;

    const file = await openSingleFileWith();
    if (!file) return;

    const sourceId = await this.std.store.blobSync.set(file);
    const type = await getFileType(file);
    const { name, size } = file;

    let embed = this.model.props.embed$.value ?? false;

    this.std.store.captureSync();
    this.std.store.transact(() => {
      this.std.store.updateBlock(this.blockId, {
        name,
        size,
        type,
        sourceId,
        embed: false,
      });

      const provider = this.std.get(AttachmentEmbedProvider);
      embed &&= provider.embedded(this.model);

      if (embed) {
        provider.convertTo(this.model);
      }

      // Reloads
      this.reload();
    });
  };

  private _selectBlock() {
    const selectionManager = this.host.selection;
    const blockSelection = selectionManager.create(BlockSelection, {
      blockId: this.blockId,
    });
    selectionManager.setGroup('note', [blockSelection]);
  }

  private readonly _trackCitationDeleteEvent = () => {
    // Check citation delete event
    this._disposables.add(
      this.std.store.slots.blockUpdated
        .pipe(
          filter(payload => {
            if (!payload.isLocal) return false;

            const { flavour, id, type } = payload;
            if (
              type !== 'delete' ||
              flavour !== this.model.flavour ||
              id !== this.model.id
            )
              return false;

            const { model } = payload;
            if (!this.citationService.isCitationModel(model)) return false;

            return true;
          })
        )
        .subscribe(() => {
          this.citationService.trackEvent('Delete');
        })
    );
  };

  // Commenting out this method as _cachedParentInfo is currently unused
  // If needed in the future, this would need to use a different API to iterate all blocks
  // since store.models is not available on the Store type
  // private _cacheParentInfo() {
  //   const store = this.model.store;
  //   const parent = store.getParent(this.model);
  //   const prev = store.getPrev(this.model);
  //   const next = store.getNext(this.model);

  //   let finalParentId = parent?.id ?? null;
  //   let finalPrevId = prev?.id ?? null;
  //   let finalNextId = next?.id ?? null;

  //   // If parent is null, try to find it by checking note blocks
  //   if (!parent) {
  //     const notes = store.getModelsByFlavour('affine:note');

  //     // Check if this attachment is in any note's children
  //     for (const note of notes) {
  //       if (note.children?.some(child => child.id === this.model.id)) {
  //         finalParentId = note.id;
  //         const childIndex = note.children.findIndex(
  //           child => child.id === this.model.id
  //         );
  //         if (childIndex > 0) {
  //           finalPrevId = note.children[childIndex - 1].id;
  //         }
  //         if (childIndex < note.children.length - 1) {
  //           finalNextId = note.children[childIndex + 1].id;
  //         }
  //         break;
  //       }
  //     }
  //   }

  //   this._cachedParentInfo = {
  //     parentId: finalParentId,
  //     prevId: finalPrevId,
  //     nextId: finalNextId,
  //   };
  // }

  override connectedCallback() {
    super.connectedCallback();

    this.contentEditable = 'false';

    this.resourceController.setEngine(this.std.store.blobSync);

    this.disposables.add(this.resourceController.subscribe());
    this.disposables.add(this.resourceController);

    this.disposables.add(
      this.model.props.sourceId$.subscribe(() => {
        this.refreshData();
      })
    );

    // Note: Cache update logic commented out as _cacheParentInfo is currently unused
    // Update cache when blocks are added (not on delete to avoid caching null)
    // this.disposables.add(
    //   this.model.store.slots.blockUpdated.subscribe(payload => {
    //     // Only update cache when blocks are added, not when deleted
    //     // (during deletion, parent relationships may already be broken)
    //     if (payload.type === 'add') {
    //       this._cacheParentInfo();
    //     }
    //   })
    // );

    // Only dispatch trash event for local deletions to avoid duplicates in shared workspaces
    this.disposables.add(
      this.std.store.slots.blockUpdated
        .pipe(
          filter(payload => {
            if (!payload.isLocal) return false;

            const { flavour, id, type } = payload;
            if (
              type !== 'delete' ||
              flavour !== this.model.flavour ||
              id !== this.model.id
            )
              return false;

            return Boolean(this.model.props.sourceId);
          })
        )
        .subscribe(() => {
          dispatchAttachmentTrashEvent(this);
        })
    );

    if (!this.model.props.style && !this.store.readonly) {
      this.store.withoutTransact(() => {
        this.store.updateBlock(this.model, {
          style: AttachmentBlockStyles[1],
        });
      });
    }

    this._trackCitationDeleteEvent();
  }

  override firstUpdated() {
    // Note: Cache parent info commented out as _cacheParentInfo is currently unused
    // Cache parent info now that the block is fully rendered and in the tree
    // this._cacheParentInfo();

    // lazy bindings
    this.disposables.addFromEvent(this, 'click', this.onClick);
    this.disposables.addFromEvent(this, 'dblclick', this._handleDoubleClick);
  }

  protected onClick(event: MouseEvent) {
    // the peek view need handle shift + click
    if (event.defaultPrevented) return;

    event.stopPropagation();

    if (!this.selected$.peek()) {
      this._selectBlock();
    }
  }

  private readonly _handleDoubleClick = (event: MouseEvent) => {
    event.stopPropagation();

    // Check if the edit dialog is open - if so, don't open preview
    const editDialogOpen = document.querySelector(
      'affine-attachment-editor-dialog'
    );
    if (editDialogOpen) {
      return;
    }

    this.openPreview().catch(console.error);
  };

  protected renderUpgradeButton = () => {
    if (this.std.store.readonly) return null;

    const onOverFileSize = this.std.get(FileSizeLimitProvider).onOverFileSize;

    return when(
      onOverFileSize,
      () => html`
        <button
          class="affine-attachment-content-button"
          @click=${(event: MouseEvent) => {
            event.stopPropagation();
            onOverFileSize?.();

            {
              const mode =
                this.std.get(DocModeProvider).getEditorMode() ?? 'page';
              const segment = mode === 'page' ? 'doc' : 'whiteboard';
              this.std
                .getOptional(TelemetryProvider)
                ?.track('AttachmentUpgradedEvent', {
                  segment,
                  page: `${segment} editor`,
                  module: 'attachment',
                  control: 'upgrade',
                  category: 'card',
                  type: this.model.props.name$.value.split('.').pop() ?? '',
                });
            }
          }}
        >
          ${UpgradeIcon()} Upgrade
        </button>
      `
    );
  };

  protected renderNormalButton = (needUpload: boolean) => {
    const label = needUpload ? 'retry' : 'reload';
    const run = async () => {
      if (needUpload) {
        await this.resourceController.upload();
        return;
      }

      this.refreshData();
    };

    return html`
      <button
        class="affine-attachment-content-button"
        @click=${(event: MouseEvent) => {
          event.stopPropagation();
          run().catch(console.error);

          {
            const mode =
              this.std.get(DocModeProvider).getEditorMode() ?? 'page';
            const segment = mode === 'page' ? 'doc' : 'whiteboard';
            this.std
              .getOptional(TelemetryProvider)
              ?.track('AttachmentReloadedEvent', {
                segment,
                page: `${segment} editor`,
                module: 'attachment',
                control: label,
                category: 'card',
                type: this.filetype,
              });
          }
        }}
      >
        ${ResetIcon()} ${label}
      </button>
    `;
  };

  protected renderInlineEditButton = () => {
    if (this.std.store.readonly) return null;

    const { downloading = false, uploading = false } =
      this.resourceController.state$.value;
    if (downloading || uploading) return null;

    const name = this.model.props.name$.value;
    const type = this.model.props.type$.value;
    if (!isAttachmentEditable(type, name)) return null;

    return html`
      <button
        class="affine-attachment-content-button"
        @click=${(event: MouseEvent) => {
          event.stopPropagation();
          this.edit().catch(error => {
            console.error('Error from inline edit button:', error);
          });
        }}
      >
        ${EditIcon()} Edit
      </button>
    `;
  };

  protected renderWithHorizontal(
    classInfo: ClassInfo,
    {
      icon,
      title,
      description,
      kind,
      state,
      needUpload,
    }: AttachmentResolvedStateInfo
  ) {
    return html`
      <div class=${classMap(classInfo)}>
        <div class="affine-attachment-content">
          <div class="affine-attachment-content-title">
            <div class="affine-attachment-content-title-icon">${icon}</div>
            <div class="affine-attachment-content-title-text truncate">
              ${title}
            </div>
          </div>

          <div class="affine-attachment-content-description">
            <div class="affine-attachment-content-info truncate">
              ${description}
            </div>
            ${choose(state, [
              ['error', () => this.renderNormalButton(needUpload)],
              ['error:oversize', this.renderUpgradeButton],
            ])}
            ${this.renderInlineEditButton()}
          </div>
        </div>

        <div class="affine-attachment-banner">${kind}</div>
      </div>
    `;
  }

  protected renderWithVertical(
    classInfo: ClassInfo,
    {
      icon,
      title,
      description,
      kind,
      state,
      needUpload,
    }: AttachmentResolvedStateInfo
  ) {
    return html`
      <div class=${classMap(classInfo)}>
        <div class="affine-attachment-content">
          <div class="affine-attachment-content-title">
            <div class="affine-attachment-content-title-icon">${icon}</div>
            <div class="affine-attachment-content-title-text truncate">
              ${title}
            </div>
          </div>

          <div class="affine-attachment-content-info truncate">
            ${description}
          </div>
        </div>

        <div class="affine-attachment-banner">
          ${kind}
          ${choose(state, [
            ['error', () => this.renderNormalButton(needUpload)],
            ['error:oversize', this.renderUpgradeButton],
          ])}
          ${this.renderInlineEditButton()}
        </div>
      </div>
    `;
  }

  protected resolvedState$ = computed<AttachmentResolvedStateInfo>(() => {
    const size = this.model.props.size;
    const name = this.model.props.name$.value;
    const kind = getAttachmentFileIcon(this.filetype);

    const resolvedState = this.resourceController.resolveStateWith({
      loadingIcon: LoadingIcon(),
      errorIcon: WarningIcon(),
      icon: AttachmentIcon(),
      title: name,
      description: formatSize(size),
    });

    return { ...resolvedState, kind };
  });

  protected renderCardView = () => {
    const resolvedState = this.resolvedState$.value;
    const cardStyle = this.model.props.style$.value ?? AttachmentBlockStyles[1];

    const classInfo = {
      'affine-attachment-card': true,
      [cardStyle]: true,
      loading: resolvedState.loading,
      error: resolvedState.error,
    };

    return when(
      cardStyle === 'cubeThick',
      () => this.renderWithVertical(classInfo, resolvedState),
      () => this.renderWithHorizontal(classInfo, resolvedState)
    );
  };

  protected renderEmbedView = () => {
    const { model, blobUrl } = this;
    if (!model.props.embed$.value || !blobUrl) return null;

    const { std, _maxFileSize } = this;
    const provider = std.get(AttachmentEmbedProvider);

    const render = provider.getRender(model, _maxFileSize);
    if (!render) return null;

    const enabled = provider.shouldShowStatus(model);

    return html`
      <div class="affine-attachment-embed-container">
        ${guard([this._refreshKey$.value], () => render(model, blobUrl))}
      </div>
      ${when(enabled, () => {
        const resolvedState = this.resolvedState$.value;
        if (resolvedState.state !== 'error') return null;
        // It should be an error messge.
        const message = resolvedState.description;
        if (!message) return null;

        const needUpload = resolvedState.needUpload;
        const action = () =>
          needUpload ? this.resourceController.upload() : this.reload();

        return html`
          <affine-resource-status
            class="affine-attachment-embed-status"
            .message=${message}
            .needUpload=${needUpload}
            .action=${action}
          ></affine-resource-status>
        `;
      })}
    `;
  };

  private readonly _renderCitation = () => {
    const { name, footnoteIdentifier } = this.model.props;
    const icon = getAttachmentFileIcon(this.filetype);

    return html`<affine-citation-card
      .icon=${icon}
      .citationTitle=${name}
      .citationIdentifier=${footnoteIdentifier}
      .active=${this.selected$.value}
    ></affine-citation-card>`;
  };

  override renderBlock() {
    return html`
      <div
        class=${classMap({
          'affine-attachment-container': true,
          focused: this.selected$.value,
          'comment-highlighted': this.isCommentHighlighted,
        })}
        style=${this.containerStyleMap}
      >
        ${when(
          this.isCitation,
          () => this._renderCitation(),
          () => this.renderEmbedView() ?? this.renderCardView()
        )}
      </div>
    `;
  }

  override accessor selectedStyle = SelectedStyle.Border;

  override accessor useCaptionEditor = true;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-attachment': AttachmentBlockComponent;
  }
}
