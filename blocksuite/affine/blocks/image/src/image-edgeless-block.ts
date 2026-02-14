import type { BlockCaptionEditor } from '@blocksuite/affine-components/caption';
import { LoadingIcon } from '@blocksuite/affine-components/icons';
import { Peekable } from '@blocksuite/affine-components/peek';
import { ResourceController } from '@blocksuite/affine-components/resource';
import {
  type ImageBlockModel,
  ImageBlockSchema,
} from '@blocksuite/affine-model';
import { cssVarV2, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { formatSize } from '@blocksuite/affine-shared/utils';
import { BrokenImageIcon, ImageIcon } from '@blocksuite/icons/lit';
import { GfxBlockComponent } from '@blocksuite/std';
import { GfxViewInteractionExtension } from '@blocksuite/std/gfx';
import { computed } from '@preact/signals-core';
import { css, html } from 'lit';
import { query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { when } from 'lit/directives/when.js';

import {
  copyImageBlob,
  downloadImageBlob,
  refreshData,
  turnImageIntoCardView,
} from './utils';

@Peekable()
export class ImageEdgelessBlockComponent extends GfxBlockComponent<ImageBlockModel> {
  private static readonly LOD_MIN_IMAGE_BYTES = 1024 * 1024;
  private static readonly LOD_MIN_IMAGE_PIXELS = 1920 * 1080;
  private static readonly LOD_MAX_ZOOM = 0.4;
  private static readonly LOD_THUMBNAIL_MAX_EDGE = 256;

  static override styles = css`
    affine-edgeless-image {
      position: relative;
    }

    affine-edgeless-image .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      top: 4px;
      right: 4px;
      width: 36px;
      height: 36px;
      padding: 5px;
      border-radius: 8px;
      background: ${unsafeCSSVarV2(
        'loading/imageLoadingBackground',
        '#92929238'
      )};

      & > svg {
        font-size: 25.71px;
      }
    }

    affine-edgeless-image .affine-image-status {
      position: absolute;
      left: 18px;
      bottom: 18px;
    }

    affine-edgeless-image .resizable-img,
    affine-edgeless-image .resizable-img img {
      width: 100%;
      height: 100%;
    }

    affine-edgeless-image .resizable-img {
      position: relative;
      overflow: hidden;
    }
  `;

  resourceController = new ResourceController(
    computed(() => this.model.props.sourceId$.value),
    'Image'
  );

  private _lodThumbnailUrl: string | null = null;
  private _lodSourceUrl: string | null = null;
  private _lodGeneratingSourceUrl: string | null = null;
  private _lodGenerationToken = 0;
  private _lastShouldUseLod = false;

  get blobUrl() {
    return this.resourceController.blobUrl$.value;
  }

  convertToCardView = () => {
    turnImageIntoCardView(this).catch(console.error);
  };

  copy = () => {
    copyImageBlob(this).catch(console.error);
  };

  download = () => {
    downloadImageBlob(this).catch(console.error);
  };

  refreshData = () => {
    refreshData(this).catch(console.error);
  };

  private _handleError() {
    this.resourceController.updateState({
      errorMessage: 'Failed to download image!',
    });
  }

  private _isLargeImage() {
    const { width = 0, height = 0, size = 0 } = this.model.props;
    const pixels = width * height;
    return (
      size >= ImageEdgelessBlockComponent.LOD_MIN_IMAGE_BYTES ||
      pixels >= ImageEdgelessBlockComponent.LOD_MIN_IMAGE_PIXELS
    );
  }

  private _shouldUseLod(blobUrl: string | null, zoom = this.gfx.viewport.zoom) {
    return (
      Boolean(blobUrl) &&
      this._isLargeImage() &&
      zoom <= ImageEdgelessBlockComponent.LOD_MAX_ZOOM
    );
  }

  private _revokeLodThumbnail() {
    if (!this._lodThumbnailUrl) {
      return;
    }

    URL.revokeObjectURL(this._lodThumbnailUrl);
    this._lodThumbnailUrl = null;
  }

  private _resetLodSource(blobUrl: string | null) {
    if (this._lodSourceUrl === blobUrl) {
      return;
    }

    this._lodGenerationToken += 1;
    this._lodGeneratingSourceUrl = null;
    this._lodSourceUrl = blobUrl;
    this._revokeLodThumbnail();
  }

  private _createImageElement(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = src;
    });
  }

  private _createThumbnailBlob(image: HTMLImageElement) {
    const maxEdge = ImageEdgelessBlockComponent.LOD_THUMBNAIL_MAX_EDGE;
    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1;
    const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return Promise.resolve<Blob | null>(null);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    return new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve);
    });
  }

  private _ensureLodThumbnail(blobUrl: string) {
    if (
      this._lodThumbnailUrl ||
      this._lodGeneratingSourceUrl === blobUrl ||
      !this._shouldUseLod(blobUrl)
    ) {
      return;
    }

    const token = ++this._lodGenerationToken;
    this._lodGeneratingSourceUrl = blobUrl;

    void this._createImageElement(blobUrl)
      .then(image => this._createThumbnailBlob(image))
      .then(blob => {
        if (!blob || token !== this._lodGenerationToken || !this.isConnected) {
          return;
        }

        const thumbnailUrl = URL.createObjectURL(blob);
        if (token !== this._lodGenerationToken || !this.isConnected) {
          URL.revokeObjectURL(thumbnailUrl);
          return;
        }

        this._revokeLodThumbnail();
        this._lodThumbnailUrl = thumbnailUrl;

        if (this._shouldUseLod(this.blobUrl)) {
          this.requestUpdate();
        }
      })
      .catch(err => {
        if (token !== this._lodGenerationToken || !this.isConnected) {
          return;
        }
        console.error(err);
      })
      .finally(() => {
        if (token === this._lodGenerationToken) {
          this._lodGeneratingSourceUrl = null;
        }
      });
  }

  private _updateLodFromViewport(zoom: number) {
    const shouldUseLod = this._shouldUseLod(this.blobUrl, zoom);
    if (shouldUseLod === this._lastShouldUseLod) {
      return;
    }

    this._lastShouldUseLod = shouldUseLod;
    if (shouldUseLod && this.blobUrl) {
      this._ensureLodThumbnail(this.blobUrl);
    }
    this.requestUpdate();
  }

  override connectedCallback() {
    super.connectedCallback();

    this.contentEditable = 'false';

    this.resourceController.setEngine(this.std.store.blobSync);

    this.disposables.add(this.resourceController.subscribe());
    this.disposables.add(this.resourceController);

    this.disposables.add(
      this.model.props.sourceId$.subscribe(() => {
        this._resetLodSource(null);
        this.refreshData();
      })
    );

    this.disposables.add(
      this.gfx.viewport.viewportUpdated.subscribe(({ zoom }) => {
        this._updateLodFromViewport(zoom);
      })
    );

    this._lastShouldUseLod = this._shouldUseLod(this.blobUrl);
  }

  override disconnectedCallback() {
    this._lodGenerationToken += 1;
    this._lodGeneratingSourceUrl = null;
    this._lodSourceUrl = null;
    this._revokeLodThumbnail();
    super.disconnectedCallback();
  }

  override renderGfxBlock() {
    const blobUrl = this.blobUrl;
    const { rotate = 0, size = 0, caption = 'Image' } = this.model.props;
    this._resetLodSource(blobUrl);

    const containerStyleMap = styleMap({
      display: 'flex',
      position: 'relative',
      width: '100%',
      height: '100%',
      transform: `rotate(${rotate}deg)`,
      transformOrigin: 'center',
    });

    const resovledState = this.resourceController.resolveStateWith({
      loadingIcon: LoadingIcon({
        strokeColor: cssVarV2('button/pureWhiteText'),
        ringColor: cssVarV2('loading/imageLoadingLayer', '#ffffff8f'),
      }),
      errorIcon: BrokenImageIcon(),
      icon: ImageIcon(),
      title: 'Image',
      description: formatSize(size),
    });

    const { loading, icon, description, error, needUpload } = resovledState;
    const shouldUseLod = this._shouldUseLod(blobUrl);
    if (shouldUseLod && blobUrl) {
      this._ensureLodThumbnail(blobUrl);
    }
    this._lastShouldUseLod = shouldUseLod;
    const imageUrl =
      shouldUseLod && this._lodThumbnailUrl ? this._lodThumbnailUrl : blobUrl;

    return html`
      <div class="affine-image-container" style=${containerStyleMap}>
        ${when(
          blobUrl,
          () => html`
            <div class="resizable-img">
              <img
                class="drag-target"
                draggable="false"
                loading="lazy"
                src=${imageUrl ?? ''}
                alt=${caption}
                @error=${this._handleError}
              />
            </div>
            ${when(loading, () => html`<div class="loading">${icon}</div>`)}
            ${when(
              Boolean(error && description),
              () =>
                html`<affine-resource-status
                  class="affine-image-status"
                  .message=${description}
                  .needUpload=${needUpload}
                  .action=${() =>
                    needUpload
                      ? this.resourceController.upload()
                      : this.refreshData()}
                ></affine-resource-status>`
            )}
          `,
          () =>
            html`<affine-image-fallback-card
              .state=${resovledState}
            ></affine-image-fallback-card>`
        )}
        <affine-block-selection .block=${this}></affine-block-selection>
      </div>
      <block-caption-editor></block-caption-editor>

      ${Object.values(this.widgets)}
    `;
  }

  @query('block-caption-editor')
  accessor captionEditor!: BlockCaptionEditor | null;

  @query('.resizable-img')
  accessor resizableImg!: HTMLDivElement;
}

export const ImageEdgelessBlockInteraction = GfxViewInteractionExtension(
  ImageBlockSchema.model.flavour,
  {
    resizeConstraint: {
      lockRatio: true,
    },
  }
);

declare global {
  interface HTMLElementTagNameMap {
    'affine-edgeless-image': ImageEdgelessBlockComponent;
  }
}
