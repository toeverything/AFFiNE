import { SurfaceBlockModel } from '@blocksuite/affine-block-surface';
import { isPeekable, Peekable } from '@blocksuite/affine-components/peek';
import { RefNodeSlotsProvider } from '@blocksuite/affine-inline-reference';
import type {
  DocMode,
  EmbedLinkedDocModel,
  EmbedLinkedDocStyles,
} from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
  REFERENCE_NODE,
} from '@blocksuite/affine-shared/consts';
import {
  DocDisplayMetaProvider,
  DocModeProvider,
  OpenDocExtensionIdentifier,
  type OpenDocMode,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import {
  cloneReferenceInfo,
  cloneReferenceInfoWithoutAliases,
  isNewTabTrigger,
  isNewViewTrigger,
  matchModels,
  referenceToNode,
} from '@blocksuite/affine-shared/utils';
import { BlockSelection } from '@blocksuite/block-std';
import { Bound } from '@blocksuite/global/gfx';
import { Text } from '@blocksuite/store';
import { computed } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { property, queryAsync, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { when } from 'lit/directives/when.js';
import throttle from 'lodash-es/throttle';
import * as Y from 'yjs';

import { EmbedBlockComponent } from '../common/embed-block-element.js';
import {
  RENDER_CARD_THROTTLE_MS,
  renderLinkedDocInCard,
} from '../common/render-linked-doc.js';
import { SyncedDocErrorIcon } from '../embed-synced-doc-block/styles.js';
import { styles } from './styles.js';
import { getEmbedLinkedDocIcons } from './utils.js';

@Peekable({
  enableOn: ({ doc }: EmbedLinkedDocBlockComponent) => !doc.readonly,
})
export class EmbedLinkedDocBlockComponent extends EmbedBlockComponent<EmbedLinkedDocModel> {
  static override styles = styles;

  private readonly _load = async () => {
    const {
      loading = true,
      isError = false,
      isBannerEmpty = true,
      isNoteContentEmpty = true,
    } = this.getInitialState();

    this._loading = loading;
    this.isError = isError;
    this.isBannerEmpty = isBannerEmpty;
    this.isNoteContentEmpty = isNoteContentEmpty;

    if (!this._loading) {
      return;
    }

    const linkedDoc = this.linkedDoc;
    if (!linkedDoc) {
      this._loading = false;
      return;
    }

    if (!linkedDoc.loaded) {
      try {
        linkedDoc.load();
      } catch (e) {
        console.error(e);
        this.isError = true;
      }
    }

    if (!this.isError && !linkedDoc.root) {
      await new Promise<void>(resolve => {
        const subscription = linkedDoc.slots.rootAdded.subscribe(() => {
          subscription.unsubscribe();
          resolve();
        });
      });
    }

    this._loading = false;

    // If it is a link to a block or element, the content will not be rendered.
    if (this._referenceToNode) {
      return;
    }

    if (!this.isError) {
      const cardStyle = this.model.props.style;
      if (cardStyle === 'horizontal' || cardStyle === 'vertical') {
        renderLinkedDocInCard(this);
      }
    }
  };

  private readonly _selectBlock = () => {
    const selectionManager = this.std.selection;
    const blockSelection = selectionManager.create(BlockSelection, {
      blockId: this.blockId,
    });
    selectionManager.setGroup('note', [blockSelection]);
  };

  private readonly _setDocUpdatedAt = () => {
    const meta = this.doc.workspace.meta.getDocMeta(this.model.props.pageId);
    if (meta) {
      const date = meta.updatedDate || meta.createDate;
      this._docUpdatedAt = new Date(date);
    }
  };

  override _cardStyle: (typeof EmbedLinkedDocStyles)[number] = 'horizontal';

  convertToEmbed = () => {
    if (this._referenceToNode) return;

    const { caption } = this.model.props;
    const { parent, doc } = this.model;
    const index = parent?.children.indexOf(this.model);

    const blockId = doc.addBlock(
      'affine:embed-synced-doc',
      {
        caption,
        ...cloneReferenceInfoWithoutAliases(this.referenceInfo$.peek()),
      },
      parent,
      index
    );

    doc.deleteBlock(this.model);

    this.std.selection.setGroup('note', [
      this.std.selection.create(BlockSelection, { blockId }),
    ]);
  };

  convertToInline = () => {
    const { doc } = this.model;
    const parent = doc.getParent(this.model);
    if (!parent) {
      return;
    }
    const index = parent.children.indexOf(this.model);

    const yText = new Y.Text();
    yText.insert(0, REFERENCE_NODE);
    yText.format(0, REFERENCE_NODE.length, {
      reference: {
        type: 'LinkedPage',
        ...this.referenceInfo$.peek(),
      },
    });
    const text = new Text(yText);

    doc.addBlock(
      'affine:paragraph',
      {
        text,
      },
      parent,
      index
    );

    doc.deleteBlock(this.model);
  };

  referenceInfo$ = computed(() => {
    const { pageId, params, title$, description$ } = this.model.props;
    return cloneReferenceInfo({
      pageId,
      params,
      title: title$.value,
      description: description$.value,
    });
  });

  icon$ = computed(() => {
    const { pageId, params, title } = this.referenceInfo$.value;
    return this.std
      .get(DocDisplayMetaProvider)
      .icon(pageId, { params, title, referenced: true }).value;
  });

  open = ({
    openMode,
    event,
  }: {
    openMode?: OpenDocMode;
    event?: MouseEvent;
  } = {}) => {
    this.std.getOptional(RefNodeSlotsProvider)?.docLinkClicked.next({
      ...this.referenceInfo$.peek(),
      openMode,
      event,
      host: this.host,
    });
  };

  refreshData = () => {
    this._load().catch(e => {
      console.error(e);
      this.isError = true;
    });
  };

  title$ = computed(() => {
    const { pageId, params, title } = this.referenceInfo$.value;
    return (
      this.std
        .get(DocDisplayMetaProvider)
        .title(pageId, { params, title, referenced: true }) || title
    );
  });

  get docTitle() {
    return this.model.props.title || this.linkedDoc?.meta?.title || 'Untitled';
  }

  get editorMode() {
    return this._linkedDocMode;
  }

  get linkedDoc() {
    return this.std.workspace.getDoc(this.model.props.pageId, {
      id: this.model.props.pageId,
    });
  }

  private _handleDoubleClick(event: MouseEvent) {
    event.stopPropagation();
    const openDocService = this.std.get(OpenDocExtensionIdentifier);
    const shouldOpenInPeek =
      openDocService.isAllowed('open-in-center-peek') && isPeekable(this);
    this.open({
      openMode: shouldOpenInPeek
        ? 'open-in-center-peek'
        : 'open-in-active-view',
      event,
    });
  }

  private _isDocEmpty() {
    const linkedDoc = this.linkedDoc;
    if (!linkedDoc) {
      return false;
    }
    return !!linkedDoc && this.isNoteContentEmpty && this.isBannerEmpty;
  }

  protected _handleClick(event: MouseEvent) {
    if (isNewTabTrigger(event)) {
      this.open({ openMode: 'open-in-new-tab', event });
    } else if (isNewViewTrigger(event)) {
      this.open({ openMode: 'open-in-new-view', event });
    }
    this._selectBlock();
  }

  override connectedCallback() {
    super.connectedCallback();

    this._cardStyle = this.model.props.style;
    this._referenceToNode = referenceToNode(this.model.props);

    this._load().catch(e => {
      console.error(e);
      this.isError = true;
    });

    const linkedDoc = this.linkedDoc;
    if (linkedDoc) {
      this.disposables.add(
        linkedDoc.workspace.slots.docListUpdated.subscribe(() => {
          this._load().catch(e => {
            console.error(e);
            this.isError = true;
          });
        })
      );
      // Should throttle the blockUpdated event to avoid too many re-renders
      // Because the blockUpdated event is triggered too frequently at some cases
      this.disposables.add(
        linkedDoc.slots.blockUpdated.subscribe(
          throttle(payload => {
            if (
              payload.type === 'update' &&
              ['', 'caption', 'xywh'].includes(payload.props.key)
            ) {
              return;
            }

            if (payload.type === 'add' && payload.init) {
              return;
            }

            this._load().catch(e => {
              console.error(e);
              this.isError = true;
            });
          }, RENDER_CARD_THROTTLE_MS)
        )
      );

      this._setDocUpdatedAt();
      this.disposables.add(
        this.doc.workspace.slots.docListUpdated.subscribe(() => {
          this._setDocUpdatedAt();
        })
      );

      if (this._referenceToNode) {
        this._linkedDocMode = this.model.props.params?.mode ?? 'page';
      } else {
        const docMode = this.std.get(DocModeProvider);
        this._linkedDocMode = docMode.getPrimaryMode(this.model.props.pageId);
        this.disposables.add(
          docMode.onPrimaryModeChange(mode => {
            this._linkedDocMode = mode;
          }, this.model.props.pageId)
        );
      }
    }

    this.disposables.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'style') {
          this._cardStyle = this.model.props.style;
        }
        if (key === 'pageId' || key === 'style') {
          this._load().catch(e => {
            console.error(e);
            this.isError = true;
          });
        }
      })
    );
  }

  getInitialState(): {
    loading?: boolean;
    isError?: boolean;
    isNoteContentEmpty?: boolean;
    isBannerEmpty?: boolean;
  } {
    return {};
  }

  override renderBlock() {
    const linkedDoc = this.linkedDoc;
    const isDeleted = !linkedDoc;
    const isLoading = this._loading;
    const isError = this.isError;
    const isEmpty = this._isDocEmpty() && this.isBannerEmpty;
    const inCanvas = matchModels(this.model.parent, [SurfaceBlockModel]);

    const cardClassMap = classMap({
      loading: isLoading,
      error: isError,
      deleted: isDeleted,
      empty: isEmpty,
      'banner-empty': this.isBannerEmpty,
      'note-empty': this.isNoteContentEmpty,
      'in-canvas': inCanvas,
      [this._cardStyle]: true,
    });

    const theme = this.std.get(ThemeProvider).theme;
    const {
      LoadingIcon,
      ReloadIcon,
      LinkedDocDeletedBanner,
      LinkedDocEmptyBanner,
      SyncedDocErrorBanner,
    } = getEmbedLinkedDocIcons(theme, this._linkedDocMode, this._cardStyle);

    const icon = isError
      ? SyncedDocErrorIcon
      : isLoading
        ? LoadingIcon
        : this.icon$.value;
    const title = isLoading ? 'Loading...' : this.title$;
    const description = this.model.props.description$;

    const showDefaultNoteContent = isError || isLoading || isDeleted || isEmpty;
    const defaultNoteContent = isError
      ? 'This linked doc failed to load.'
      : isLoading
        ? ''
        : isDeleted
          ? 'This linked doc is deleted.'
          : isEmpty
            ? 'Preview of the doc will be displayed here.'
            : '';

    const dateText =
      this._cardStyle === 'cube'
        ? this._docUpdatedAt.toLocaleTimeString()
        : this._docUpdatedAt.toLocaleString();

    const showDefaultBanner = isError || isLoading || isDeleted || isEmpty;

    const defaultBanner = isError
      ? SyncedDocErrorBanner
      : isLoading
        ? LinkedDocEmptyBanner
        : isDeleted
          ? LinkedDocDeletedBanner
          : LinkedDocEmptyBanner;

    const hasDescriptionAlias = Boolean(description.value);

    return this.renderEmbed(
      () => html`
        <div
          class="affine-embed-linked-doc-block ${cardClassMap}"
          style=${styleMap({
            transform: `scale(${this._scale})`,
            transformOrigin: '0 0',
          })}
          @click=${this._handleClick}
          @dblclick=${this._handleDoubleClick}
        >
          <div class="affine-embed-linked-doc-content">
            <div class="affine-embed-linked-doc-content-title">
              <div class="affine-embed-linked-doc-content-title-icon">
                ${icon}
              </div>

              <div class="affine-embed-linked-doc-content-title-text">
                ${title}
              </div>
            </div>

            ${when(
              hasDescriptionAlias,
              () =>
                html`<div class="affine-embed-linked-doc-content-note alias">
                  ${description}
                </div>`,
              () =>
                when(
                  showDefaultNoteContent,
                  () => html`
                    <div class="affine-embed-linked-doc-content-note default">
                      ${defaultNoteContent}
                    </div>
                  `,
                  () => html`
                    <div
                      class="affine-embed-linked-doc-content-note render"
                    ></div>
                  `
                )
            )}
            ${isError
              ? html`
                  <div class="affine-embed-linked-doc-card-content-reload">
                    <div
                      class="affine-embed-linked-doc-card-content-reload-button"
                      @click=${this.refreshData}
                    >
                      ${ReloadIcon} <span>Reload</span>
                    </div>
                  </div>
                `
              : html`
                  <div class="affine-embed-linked-doc-content-date">
                    <span>Updated</span>

                    <span>${dateText}</span>
                  </div>
                `}
          </div>

          ${showDefaultBanner
            ? html`
                <div class="affine-embed-linked-doc-banner default">
                  ${defaultBanner}
                </div>
              `
            : nothing}
        </div>
      `
    );
  }

  override updated() {
    // update card style when linked doc deleted
    const linkedDoc = this.linkedDoc;
    const { xywh, style } = this.model.props;
    const bound = Bound.deserialize(xywh);
    if (linkedDoc && style === 'horizontalThin') {
      bound.w = EMBED_CARD_WIDTH.horizontal;
      bound.h = EMBED_CARD_HEIGHT.horizontal;
      this.doc.withoutTransact(() => {
        this.doc.updateBlock(this.model, {
          xywh: bound.serialize(),
          style: 'horizontal',
        });
      });
    } else if (!linkedDoc && style === 'horizontal') {
      bound.w = EMBED_CARD_WIDTH.horizontalThin;
      bound.h = EMBED_CARD_HEIGHT.horizontalThin;
      this.doc.withoutTransact(() => {
        this.doc.updateBlock(this.model, {
          xywh: bound.serialize(),
          style: 'horizontalThin',
        });
      });
    }
  }

  @state()
  private accessor _docUpdatedAt: Date = new Date();

  @state()
  private accessor _linkedDocMode: DocMode = 'page';

  @state()
  private accessor _loading = false;

  // reference to block/element
  @state()
  private accessor _referenceToNode = false;

  @property({ attribute: false })
  accessor isBannerEmpty = false;

  @property({ attribute: false })
  accessor isError = false;

  @property({ attribute: false })
  accessor isNoteContentEmpty = false;

  @queryAsync('.affine-embed-linked-doc-content-note.render')
  accessor noteContainer!: Promise<HTMLDivElement | null>;
}
