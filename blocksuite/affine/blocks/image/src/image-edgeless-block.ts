import type { BlockCaptionEditor } from '@blocksuite/affine-components/caption';
import { getLoadingIconWith } from '@blocksuite/affine-components/icons';
import { Peekable } from '@blocksuite/affine-components/peek';
import { ResourceController } from '@blocksuite/affine-components/resource';
import type { ImageBlockModel } from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { humanFileSize } from '@blocksuite/affine-shared/utils';
import { BrokenImageIcon, ImageIcon } from '@blocksuite/icons/lit';
import { GfxBlockComponent } from '@blocksuite/std';
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
      width: 20px;
      height: 20px;
      padding: 4px;
      border-radius: 4px;
      background: ${unsafeCSSVarV2('loading/backgroundLayer')};
    }

    affine-edgeless-image .resizable-img,
    affine-edgeless-image .resizable-img img {
      width: 100%;
      height: 100%;
    }
  `;

  resourceController = new ResourceController(
    computed(() => this.model.props.sourceId$.value),
    'Image'
  );

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

  override connectedCallback() {
    super.connectedCallback();

    this.contentEditable = 'false';

    this.resourceController.setEngine(this.std.store.blobSync);

    this.disposables.add(this.resourceController.subscribe());
    this.disposables.add(this.resourceController);

    this.refreshData();
  }

  override renderGfxBlock() {
    const theme = this.std.get(ThemeProvider).theme$.value;
    const loadingIcon = getLoadingIconWith(theme);

    const blobUrl = this.blobUrl;
    const { rotate = 0, size = 0, caption = 'Image' } = this.model.props;

    const containerStyleMap = styleMap({
      display: 'flex',
      position: 'relative',
      width: '100%',
      height: '100%',
      transform: `rotate(${rotate}deg)`,
      transformOrigin: 'center',
    });

    const resovledState = this.resourceController.resolveStateWith({
      loadingIcon,
      errorIcon: BrokenImageIcon(),
      icon: ImageIcon(),
      title: 'Image',
      description: humanFileSize(size),
    });

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
                src=${blobUrl}
                alt=${caption}
                @error=${this._handleError}
              />
            </div>
            ${when(
              resovledState.loading,
              () => html`<div class="loading">${loadingIcon}</div>`
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

declare global {
  interface HTMLElementTagNameMap {
    'affine-edgeless-image': ImageEdgelessBlockComponent;
  }
}
