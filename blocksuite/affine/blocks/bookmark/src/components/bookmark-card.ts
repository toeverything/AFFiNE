import { getEmbedCardIcons } from '@blocksuite/affine-block-embed';
import { LoadingIcon, WebIcon16 } from '@blocksuite/affine-components/icons';
import { ImageProxyService } from '@blocksuite/affine-shared/adapters';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { getHostName } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { OpenInNewIcon } from '@blocksuite/icons/lit';
import { isGfxBlockComponent, ShadowlessElement } from '@blocksuite/std';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import type { BookmarkBlockComponent } from '../bookmark-block.js';
import { styles } from '../styles.js';

export class BookmarkCard extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  override connectedCallback(): void {
    super.connectedCallback();

    this.disposables.add(
      this.bookmark.model.propsUpdated.subscribe(() => {
        this.requestUpdate();
      })
    );

    this.disposables.add(
      this.bookmark.std
        .get(ThemeProvider)
        .theme$.subscribe(() => this.requestUpdate())
    );
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
