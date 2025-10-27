import {
  CaptionedBlockComponent,
  SelectedStyle,
} from '@blocksuite/affine-components/caption';
import type {
  BookmarkBlockModel,
  LinkPreviewData,
} from '@blocksuite/affine-model';
import { ImageProxyService } from '@blocksuite/affine-shared/adapters';
import {
  BlockElementCommentManager,
  CitationProvider,
  DocModeProvider,
  LinkPreviewServiceIdentifier,
} from '@blocksuite/affine-shared/services';
import { normalizeUrl } from '@blocksuite/affine-shared/utils';
import { BlockSelection } from '@blocksuite/std';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';
import { html } from 'lit';
import { property, query } from 'lit/decorators.js';
import { type ClassInfo, classMap } from 'lit/directives/class-map.js';
import { type StyleInfo, styleMap } from 'lit/directives/style-map.js';
import { filter } from 'rxjs/operators';

import { refreshBookmarkUrlData } from './utils.js';

export const BOOKMARK_MIN_WIDTH = 450;

export class BookmarkBlockComponent extends CaptionedBlockComponent<BookmarkBlockModel> {
  selectedStyle$: ReadonlySignal<ClassInfo> | null = computed<ClassInfo>(
    () => ({
      'selected-style': this.selected$.value,
    })
  );

  private _fetchAbortController?: AbortController;

  blockDraggable = true;

  protected containerStyleMap!: ReturnType<typeof styleMap>;

  /**
   * @description Local link preview data
   * When the doc is in readonly mode, and the link preview data are not provided (stored in the block model),
   * We will use the local link preview data fetched from the link previewer service to render the block.
   */
  private readonly _localLinkPreview$ = signal<LinkPreviewData>({
    icon: null,
    title: null,
    description: null,
    image: null,
  });

  /**
   * @description Link preview data for actual rendering
   * When the doc is not in readonly mode, and the link preview data are provided (stored in the block model),
   * We will use the model props to render the block.
   * Otherwise, we will use the local link preview data to render the block.
   */
  linkPreview$ = computed(() => {
    const modelProps = this.model.props;
    const local = this._localLinkPreview$.value;
    return {
      icon: modelProps.icon$.value ?? local.icon ?? null,
      title: modelProps.title$.value ?? local.title ?? null,
      description: modelProps.description$.value ?? local.description ?? null,
      image: modelProps.image$.value ?? local.image ?? null,
    };
  });

  private readonly _updateLocalLinkPreview = () => {
    // cancel any inflight request
    this._fetchAbortController?.abort();
    this._fetchAbortController = new AbortController();

    this.loading = true;
    this.error = false;

    this.std
      .get(LinkPreviewServiceIdentifier)
      .query(this.model.props.url, this._fetchAbortController.signal)
      .then(data => {
        this._localLinkPreview$.value = {
          icon: data.icon ?? null,
          title: data.title ?? null,
          description: data.description ?? null,
          image: data.image ?? null,
        };
      })
      .catch(() => {
        this.error = true;
      })
      .finally(() => {
        this.loading = false;
      });
  };

  selectBlock = () => {
    const selectionManager = this.std.selection;
    const blockSelection = selectionManager.create(BlockSelection, {
      blockId: this.blockId,
    });
    selectionManager.setGroup('note', [blockSelection]);
  };

  get link() {
    return normalizeUrl(this.model.props.url);
  }

  open = () => {
    window.open(this.link, '_blank');
  };

  refreshData = () => {
    refreshBookmarkUrlData(this, this._fetchAbortController?.signal).catch(
      console.error
    );
  };

  get citationService() {
    return this.std.get(CitationProvider);
  }

  get isCitation() {
    return this.citationService.isCitationModel(this.model);
  }

  get imageProxyService() {
    return this.std.get(ImageProxyService);
  }

  get isCommentHighlighted() {
    return (
      this.std
        .getOptional(BlockElementCommentManager)
        ?.isBlockCommentHighlighted(this.model) ?? false
    );
  }

  handleClick = (event: MouseEvent) => {
    event.stopPropagation();

    if (
      this.model.parent?.flavour !== 'affine:surface' &&
      !this.store.readonly
    ) {
      this.selectBlock();
    }
  };

  handleDoubleClick = (event: MouseEvent) => {
    event.stopPropagation();
    this.open();
  };

  private readonly _renderCitationView = () => {
    const { url, footnoteIdentifier } = this.model.props;
    const { icon, title, description } = this.linkPreview$.value;
    const iconSrc = icon ? this.imageProxyService.buildUrl(icon) : undefined;
    return html`
      <affine-citation-card
        .icon=${iconSrc}
        .citationTitle=${title || url}
        .citationContent=${description}
        .citationIdentifier=${footnoteIdentifier}
        .onClickCallback=${this.handleClick}
        .onDoubleClickCallback=${this.handleDoubleClick}
        .active=${this.selected$.value}
      ></affine-citation-card>
    `;
  };

  private readonly _renderCardView = () => {
    return html`<bookmark-card
      .bookmark=${this}
      .loading=${this.loading}
      .error=${this.error}
    ></bookmark-card>`;
  };

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

  override connectedCallback() {
    super.connectedCallback();

    const mode = this.std.get(DocModeProvider).getEditorMode();
    const miniWidth = `${BOOKMARK_MIN_WIDTH}px`;

    this.containerStyleMap = styleMap({
      position: 'relative',
      width: '100%',
      ...(mode === 'edgeless' ? { miniWidth } : {}),
    });

    this._fetchAbortController = new AbortController();

    this.contentEditable = 'false';

    if (
      (!this.model.props.description && !this.model.props.title) ||
      (!this.model.props.image && this.model.props.style === 'vertical')
    ) {
      // When the doc is readonly, and the preview data not provided
      // We should fetch the preview data and update the local link preview data
      if (this.store.readonly) {
        this._updateLocalLinkPreview();
        return;
      }
      // Otherwise, we should refresh the data to the model props
      this.refreshData();
    }

    this.disposables.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'url') {
          this.refreshData();
        }
      })
    );

    this._trackCitationDeleteEvent();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._fetchAbortController?.abort();
  }

  override renderBlock() {
    return html`
      <div
        draggable="${this.blockDraggable ? 'true' : 'false'}"
        class=${classMap({
          'affine-bookmark-container': true,
          ...this.selectedStyle$?.value,
        })}
        style=${this.containerStyleMap}
      >
        ${this.isCitation ? this._renderCitationView() : this._renderCardView()}
      </div>
    `;
  }

  protected override accessor blockContainerStyles: StyleInfo = {
    margin: '18px 0',
  };

  @query('bookmark-card')
  accessor bookmarkCard!: HTMLElement;

  @property({ attribute: false })
  accessor error = false;

  @property({ attribute: false })
  accessor loading = false;

  override accessor selectedStyle = SelectedStyle.Border;

  override accessor useCaptionEditor = true;

  override accessor useZeroWidth = true;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-bookmark': BookmarkBlockComponent;
  }
}
