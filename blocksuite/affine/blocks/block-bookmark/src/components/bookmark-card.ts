import { getEmbedCardIcons } from '@blocksuite/affine-block-embed';
import { WebIcon16 } from '@blocksuite/affine-components/icons';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { getHostName } from '@blocksuite/affine-shared/utils';
import { BlockSelection, ShadowlessElement } from '@blocksuite/block-std';
import { WithDisposable } from '@blocksuite/global/lit';
import { OpenInNewIcon } from '@blocksuite/icons/lit';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import type { BookmarkBlockComponent } from '../bookmark-block.js';
import { styles } from '../styles.js';

export class BookmarkCard extends WithDisposable(ShadowlessElement) {
  static override styles = styles;

  private _handleClick(event: MouseEvent) {
    event.stopPropagation();
    const model = this.bookmark.model;

    if (model.parent?.flavour !== 'affine:surface') {
      this._selectBlock();
    }
  }

  private _handleDoubleClick(event: MouseEvent) {
    event.stopPropagation();
    this.bookmark.open();
  }

  private _selectBlock() {
    const selectionManager = this.bookmark.host.selection;
    const blockSelection = selectionManager.create(BlockSelection, {
      blockId: this.bookmark.blockId,
    });
    selectionManager.setGroup('note', [blockSelection]);
  }

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
    const { icon, title, url, description, image, style } =
      this.bookmark.model.props;

    const cardClassMap = classMap({
      loading: this.loading,
      error: this.error,
      [style]: true,
      selected: this.bookmark.selected$.value,
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
    const { LoadingIcon, EmbedCardBannerIcon } = getEmbedCardIcons(theme);

    const titleIconType =
      !icon?.split('.').pop() || icon?.split('.').pop() === 'svg'
        ? 'svg+xml'
        : icon?.split('.').pop();

    const titleIcon = this.loading
      ? LoadingIcon
      : icon
        ? html`<object
            type="image/${titleIconType}"
            data=${icon}
            draggable="false"
          >
            ${WebIcon16}
          </object>`
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
        ? html`<object type="image/webp" data=${image} draggable="false">
            ${EmbedCardBannerIcon}
          </object>`
        : EmbedCardBannerIcon;

    return html`
      <div
        class="affine-bookmark-card ${cardClassMap}"
        @click=${this._handleClick}
        @dblclick=${this._handleDoubleClick}
      >
        <div class="affine-bookmark-content">
          <div class="affine-bookmark-content-title">
            <div class="affine-bookmark-content-title-icon">${titleIcon}</div>
            <div class="affine-bookmark-content-title-text">${titleText}</div>
          </div>
          <div class="affine-bookmark-content-description">
            ${descriptionText}
          </div>
          <div
            class="affine-bookmark-content-url-wrapper"
            @click=${this.bookmark.open}
          >
            <div class="affine-bookmark-content-url">
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
