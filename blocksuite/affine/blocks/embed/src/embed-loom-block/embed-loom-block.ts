import { LoadingIcon, OpenIcon } from '@blocksuite/affine-components/icons';
import type { EmbedLoomModel, EmbedLoomStyles } from '@blocksuite/affine-model';
import { ImageProxyService } from '@blocksuite/affine-shared/adapters';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { BlockSelection } from '@blocksuite/std';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import { EmbedBlockComponent } from '../common/embed-block-element.js';
import { getEmbedCardIcons } from '../common/utils.js';
import { loomUrlRegex } from './embed-loom-model.js';
import type { EmbedLoomBlockService } from './embed-loom-service.js';
import { LoomIcon, styles } from './styles.js';
import { refreshEmbedLoomUrlData } from './utils.js';

export class EmbedLoomBlockComponent extends EmbedBlockComponent<
  EmbedLoomModel,
  EmbedLoomBlockService
> {
  static override styles = styles;

  override _cardStyle: (typeof EmbedLoomStyles)[number] = 'video';

  open = () => {
    let link = this.model.props.url;
    if (!link.match(/^[a-zA-Z]+:\/\//)) {
      link = 'https://' + link;
    }
    window.open(link, '_blank');
  };

  refreshData = () => {
    refreshEmbedLoomUrlData(this, this.fetchAbortController.signal).catch(
      console.error
    );
  };

  private _handleDoubleClick(event: MouseEvent) {
    event.stopPropagation();
    this.open();
  }

  private _selectBlock() {
    const selectionManager = this.host.selection;
    const blockSelection = selectionManager.create(BlockSelection, {
      blockId: this.blockId,
    });
    selectionManager.setGroup('note', [blockSelection]);
  }

  protected _handleClick(event: MouseEvent) {
    event.stopPropagation();
    this._selectBlock();
  }

  override connectedCallback() {
    super.connectedCallback();
    this._cardStyle = this.model.props.style;

    if (!this.model.props.videoId) {
      this.store.withoutTransact(() => {
        const url = this.model.props.url;
        const urlMatch = url.match(loomUrlRegex);
        if (urlMatch) {
          const [, videoId] = urlMatch;
          this.store.updateBlock(this.model, {
            videoId,
          });
        }
      });
    }

    if (!this.model.props.description && !this.model.props.title) {
      this.store.withoutTransact(() => {
        this.refreshData();
      });
    }

    this.disposables.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        this.requestUpdate();
        if (key === 'url') {
          this.refreshData();
        }
      })
    );
  }

  override renderBlock() {
    const { image, title = 'Loom', description, videoId } = this.model.props;

    const loading = this.loading;
    const theme = this.std.get(ThemeProvider).theme;
    const imageProxyService = this.store.get(ImageProxyService);
    const { EmbedCardBannerIcon } = getEmbedCardIcons(theme);
    const titleIcon = loading ? LoadingIcon() : LoomIcon;
    const titleText = loading ? 'Loading...' : title;
    const descriptionText = loading ? '' : description;
    const bannerImage =
      !loading && image
        ? html`<img src=${imageProxyService.buildUrl(image)} alt="banner" />`
        : EmbedCardBannerIcon;

    return this.renderEmbed(
      () => html`
        <div
          class=${classMap({
            'affine-embed-loom-block': true,
            loading,
            selected: this.selected$.value,
          })}
          style=${styleMap({
            transformOrigin: '0 0',
          })}
          @click=${this._handleClick}
          @dblclick=${this._handleDoubleClick}
        >
          <div class="affine-embed-loom-video">
            ${videoId
              ? html`
                  <div class="affine-embed-loom-video-iframe-container">
                    <iframe
                      src=${`https://www.loom.com/embed/${videoId}?hide_title=true`}
                      frameborder="0"
                      allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                      sandbox="allow-scripts allow-same-origin allow-presentation"
                      loading="lazy"
                      credentialless
                    ></iframe>

                    <!-- overlay to prevent the iframe from capturing pointer events -->
                    <div
                      class=${classMap({
                        'affine-embed-loom-video-iframe-overlay': true,
                        hide: !this.showOverlay$.value,
                      })}
                    ></div>
                  </div>
                `
              : bannerImage}
          </div>
          <div class="affine-embed-loom-content">
            <div class="affine-embed-loom-content-header">
              <div class="affine-embed-loom-content-title-icon">
                ${titleIcon}
              </div>

              <div class="affine-embed-loom-content-title-text">
                ${titleText}
              </div>
            </div>

            <div class="affine-embed-loom-content-description">
              ${descriptionText}
            </div>

            <div class="affine-embed-loom-content-url" @click=${this.open}>
              <span>loom.com</span>

              <div class="affine-embed-loom-content-url-icon">${OpenIcon}</div>
            </div>
          </div>
        </div>
      `
    );
  }

  @property({ attribute: false })
  accessor loading = false;
}
