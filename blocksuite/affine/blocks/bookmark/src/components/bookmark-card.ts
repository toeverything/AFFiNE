import { getEmbedCardIcons } from '@blocksuite/affine-block-embed';
import { LoadingIcon, WebIcon16 } from '@blocksuite/affine-components/icons';
import {
  type SharePreviewLoadState,
  SharePreviewRecordLoader,
} from '@blocksuite/affine-model';
import { ImageProxyService } from '@blocksuite/affine-shared/adapters';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { getHostName } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  ArrowDownSmallIcon,
  ArrowRightSmallIcon,
  OpenInNewIcon,
} from '@blocksuite/icons/lit';
import { isGfxBlockComponent, ShadowlessElement } from '@blocksuite/std';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import type { BookmarkBlockComponent } from '../bookmark-block.js';
import { styles } from '../styles.js';

export class BookmarkCard extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  private detailsLoader?: SharePreviewRecordLoader;

  private detailsLoaderKey?: string;

  private detailsOpen = false;

  private detailsState: SharePreviewLoadState | { status: 'loading' } = {
    status: 'unavailable',
  };

  override connectedCallback(): void {
    super.connectedCallback();

    this.disposables.add(
      this.bookmark.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'sharePreviewSourceId' || key === 'sharePreviewVersion') {
          this.detailsLoader = undefined;
          this.detailsLoaderKey = undefined;
          this.detailsOpen = false;
          this.detailsState = { status: 'unavailable' };
        }
        this.requestUpdate();
      })
    );

    this.disposables.add(
      this.bookmark.std
        .get(ThemeProvider)
        .theme$.subscribe(() => this.requestUpdate())
    );
  }

  private readonly toggleDetails = (event: MouseEvent) => {
    event.stopPropagation();
    this.detailsOpen = !this.detailsOpen;
    this.requestUpdate();
    if (this.detailsOpen) {
      this.loadDetails().catch(() => undefined);
    }
  };

  private async loadDetails() {
    const { sharePreviewSourceId, sharePreviewVersion } =
      this.bookmark.model.props;
    if (!sharePreviewSourceId) return;
    const loaderKey = `${sharePreviewVersion ?? ''}:${sharePreviewSourceId}`;
    if (!this.detailsLoader || this.detailsLoaderKey !== loaderKey) {
      this.detailsLoaderKey = loaderKey;
      this.detailsLoader = new SharePreviewRecordLoader(
        sharePreviewSourceId,
        sharePreviewVersion,
        sourceId => this.bookmark.store.blobSync.get(sourceId)
      );
    }
    this.detailsState = { status: 'loading' };
    this.requestUpdate();
    const state = await this.detailsLoader.load();
    if (this.detailsLoaderKey !== loaderKey) return;
    this.detailsState = state;
    this.requestUpdate();
  }

  private renderDetails() {
    const sourceId = this.bookmark.model.props.sharePreviewSourceId;
    if (!sourceId) return nothing;
    const contentId = `bookmark-details-${this.bookmark.model.id}`;
    const disclosureIcon = this.detailsOpen
      ? ArrowDownSmallIcon()
      : ArrowRightSmallIcon();
    return html`
      <div class="affine-bookmark-details">
        <button
          type="button"
          class="affine-bookmark-details-toggle"
          aria-expanded=${this.detailsOpen ? 'true' : 'false'}
          aria-controls=${contentId}
          title=${this.detailsOpen ? 'Hide details' : 'Show details'}
          @click=${this.toggleDetails}
        >
          ${disclosureIcon}<span>Details</span>
        </button>
        ${
          this.detailsOpen
            ? html`<div id=${contentId} class="affine-bookmark-details-content">
                ${this.renderDetailsContent()}
              </div>`
            : nothing
        }
      </div>
    `;
  }

  private renderDetailsContent() {
    if (this.detailsState.status === 'loading') {
      return html`<div class="affine-bookmark-details-status">
        ${LoadingIcon()}<span>Loading details...</span>
      </div>`;
    }
    if (this.detailsState.status === 'unavailable') {
      return html`<div class="affine-bookmark-details-status">
        Details unavailable.
      </div>`;
    }
    const record = this.detailsState.record;
    const metadata = [
      record.provider,
      record.durationSeconds === undefined
        ? undefined
        : `${Math.floor(record.durationSeconds / 60)}:${Math.floor(
            record.durationSeconds % 60
          )
            .toString()
            .padStart(2, '0')}`,
    ].filter(Boolean);
    return html`
      ${
        metadata.length
          ? html`<div class="affine-bookmark-details-meta">
              ${metadata.join(' · ')}
            </div>`
          : nothing
      }
      ${
        record.description
          ? html`<div class="affine-bookmark-details-description">
              ${record.description}
            </div>`
          : nothing
      }
      ${
        record.transcript?.segments.length
          ? html`<div class="affine-bookmark-details-transcript">
              ${record.transcript.chapters?.map(
                chapter => html`<div class="affine-bookmark-details-chapter">
                  ${chapter.title}
                </div>`
              )}
              ${record.transcript.segments.map(
                segment => html`<div class="affine-bookmark-details-segment">
                  ${
                    segment.speaker
                      ? html`<strong>${segment.speaker}:</strong>`
                      : nothing
                  }
                  <span>${segment.text}</span>
                </div>`
              )}
            </div>`
          : nothing
      }
    `;
  }

  override render() {
    const { url, style } = this.bookmark.model.props;
    const { icon, title, description, image } =
      this.bookmark.linkPreview$.value;

    const cardClassMap = classMap({
      loading: this.loading,
      error: this.error,
      [style]: true,
      selected: this.bookmark.selected$.value,
      edgeless: isGfxBlockComponent(this.bookmark),
      'comment-highlighted': this.bookmark.isCommentHighlighted,
    });

    const domainName = url.match(
      /^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:/\n]+)/im
    )?.[1];

    const titleText = this.loading
      ? 'Loading...'
      : !title
        ? this.error
          ? (domainName ?? 'Link card')
          : ''
        : title;

    const theme = this.bookmark.std.get(ThemeProvider).theme;
    const { EmbedCardBannerIcon } = getEmbedCardIcons(theme);
    const imageProxyService = this.bookmark.store.get(ImageProxyService);

    const titleIcon = this.loading
      ? LoadingIcon()
      : icon
        ? html`<img src=${imageProxyService.buildUrl(icon)} alt="icon" />`
        : WebIcon16;

    const descriptionText = this.loading
      ? ''
      : !description
        ? this.error
          ? 'Failed to retrieve link information.'
          : url
        : (description ?? '');

    const bannerImage =
      !this.loading && image
        ? html`<img src=${imageProxyService.buildUrl(image)} alt="banner" />`
        : EmbedCardBannerIcon;

    return html`
      <div
        class="affine-bookmark-card ${cardClassMap}"
        @click=${this.bookmark.handleClick}
        @dblclick=${this.bookmark.handleDoubleClick}
      >
        <div class="affine-bookmark-content">
          <div class="affine-bookmark-content-title">
            <div class="affine-bookmark-content-title-icon">${titleIcon}</div>
            <div class="affine-bookmark-content-title-text">${titleText}</div>
          </div>
          <div class="affine-bookmark-content-description">
            ${descriptionText}
          </div>
          <div class="affine-bookmark-content-url-wrapper">
            <div
              class="affine-bookmark-content-url"
              @click=${this.bookmark.open}
            >
              <span>${getHostName(url)}</span>
              <div class="affine-bookmark-content-url-icon">
                ${OpenInNewIcon({ width: '12', height: '12' })}
              </div>
            </div>
          </div>
        </div>
        <div class="affine-bookmark-banner">${bannerImage}</div>
      </div>
      ${this.renderDetails()}
    `;
  }

  @property({ attribute: false })
  accessor bookmark!: BookmarkBlockComponent;

  @property({ attribute: false })
  accessor error!: boolean;

  @property({ attribute: false })
  accessor loading!: boolean;
}

declare global {
  interface HTMLElementTagNameMap {
    'bookmark-card': BookmarkCard;
  }
}
