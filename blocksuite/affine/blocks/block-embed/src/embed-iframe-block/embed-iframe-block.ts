import { SurfaceBlockModel } from '@blocksuite/affine-block-surface';
import {
  CaptionedBlockComponent,
  SelectedStyle,
} from '@blocksuite/affine-components/caption';
import type { EmbedIframeBlockModel } from '@blocksuite/affine-model';
import {
  type EmbedIframeData,
  EmbedIframeService,
  FeatureFlagService,
  type IframeOptions,
  LinkPreviewerService,
} from '@blocksuite/affine-shared/services';
import { matchModels } from '@blocksuite/affine-shared/utils';
import { BlockSelection } from '@blocksuite/block-std';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { type ClassInfo, classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';

import { embedIframeBlockStyles } from './style.js';
import type { EmbedIframeStatusCardOptions } from './types.js';
import { safeGetIframeSrc } from './utils.js';

export type EmbedIframeStatus = 'idle' | 'loading' | 'success' | 'error';
const DEFAULT_IFRAME_HEIGHT = 152;
const DEFAULT_IFRAME_WIDTH = '100%';

export class EmbedIframeBlockComponent extends CaptionedBlockComponent<EmbedIframeBlockModel> {
  selectedStyle$: ReadonlySignal<ClassInfo> | null = computed<ClassInfo>(
    () => ({
      'selected-style': this.selected$.value,
    })
  );

  blockDraggable = true;

  static override styles = embedIframeBlockStyles;

  readonly status$ = signal<EmbedIframeStatus>('idle');
  readonly error$ = signal<Error | null>(null);

  readonly isLoading$ = computed(() => this.status$.value === 'loading');
  readonly hasError$ = computed(() => this.status$.value === 'error');
  readonly isSuccess$ = computed(() => this.status$.value === 'success');

  readonly isDraggingOnHost$ = signal(false);
  readonly isResizing$ = signal(false);
  // show overlay to prevent the iframe from capturing pointer events
  // when the block is dragging, resizing, or not selected
  readonly showOverlay$ = computed(
    () =>
      this.isSuccess$.value &&
      (this.isDraggingOnHost$.value ||
        this.isResizing$.value ||
        !this.selected$.value)
  );

  private _iframeOptions: IframeOptions | undefined = undefined;

  get embedIframeService() {
    return this.std.get(EmbedIframeService);
  }

  get linkPreviewService() {
    return this.std.get(LinkPreviewerService);
  }

  get inSurface() {
    return matchModels(this.model.parent, [SurfaceBlockModel]);
  }

  get isEmbedIframeBlockEnabled() {
    const featureFlagService = this.doc.get(FeatureFlagService);
    const flag = featureFlagService.getFlag('enable_embed_iframe_block');
    return flag ?? false;
  }

  get _statusCardOptions(): EmbedIframeStatusCardOptions {
    return this.inSurface
      ? { layout: 'vertical' }
      : { layout: 'horizontal', height: 114 };
  }

  open = () => {
    const link = this.model.props.url;
    window.open(link, '_blank');
  };

  refreshData = async () => {
    try {
      // set loading status
      this.status$.value = 'loading';
      this.error$.value = null;

      // get embed data
      const embedIframeService = this.embedIframeService;
      const linkPreviewService = this.linkPreviewService;
      if (!embedIframeService || !linkPreviewService) {
        throw new BlockSuiteError(
          ErrorCode.ValueNotExists,
          'EmbedIframeService or LinkPreviewerService not found'
        );
      }

      const { url } = this.model.props;
      if (!url) {
        throw new BlockSuiteError(
          ErrorCode.ValueNotExists,
          'No original URL provided'
        );
      }

      // get embed data and preview data in a promise
      const [embedData, previewData] = await Promise.all([
        embedIframeService.getEmbedIframeData(url),
        linkPreviewService.query(url),
      ]);

      // if the embed data is not found, and the iframeUrl is not set, throw an error
      const currentIframeUrl = this.model.props.iframeUrl;
      if (!embedData && !currentIframeUrl) {
        throw new BlockSuiteError(
          ErrorCode.ValueNotExists,
          'Failed to get embed data'
        );
      }

      // update model
      const iframeUrl = this._getIframeUrl(embedData) ?? currentIframeUrl;
      this.doc.updateBlock(this.model, {
        iframeUrl,
        title: embedData?.title || previewData?.title,
        description: embedData?.description || previewData?.description,
      });

      // update iframe options, to ensure the iframe is rendered with the correct options
      this._updateIframeOptions(url);

      // set success status
      this.status$.value = 'success';
    } catch (err) {
      // set error status
      this.status$.value = 'error';
      this.error$.value = err instanceof Error ? err : new Error(String(err));
      console.error('Failed to refresh iframe data:', err);
    }
  };

  /**
   * Get the iframe url from the embed data, first check if iframe_url is set,
   * if not, check if html is set and get the iframe src from html
   * @param embedData - The embed data
   * @returns The iframe url
   */
  private readonly _getIframeUrl = (embedData: EmbedIframeData | null) => {
    const { iframe_url, html } = embedData ?? {};
    return iframe_url ?? (html && safeGetIframeSrc(html));
  };

  private readonly _updateIframeOptions = (url: string) => {
    const config = this.embedIframeService?.getConfig(url);
    if (config) {
      this._iframeOptions = config.options;
    }
  };

  private readonly _handleDoubleClick = (event: MouseEvent) => {
    event.stopPropagation();
    this.open();
  };

  private readonly _selectBlock = () => {
    const selectionManager = this.host.selection;
    const blockSelection = selectionManager.create(BlockSelection, {
      blockId: this.blockId,
    });
    selectionManager.setGroup('note', [blockSelection]);
  };

  protected _handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    // We don't need to select the block when the block is in the surface
    if (this.inSurface) {
      return;
    }
    this._selectBlock();
  };

  private readonly _handleRetry = async () => {
    await this.refreshData();
  };

  private readonly _renderIframe = () => {
    const { iframeUrl } = this.model.props;
    const {
      widthPercent,
      heightInNote,
      style,
      allow,
      referrerpolicy,
      scrolling,
      allowFullscreen,
    } = this._iframeOptions ?? {};
    const width = `${widthPercent}%`;
    // if the block is in the surface, use 100% as the height
    // otherwise, use the heightInNote
    const height = this.inSurface ? '100%' : heightInNote;
    return html`
      <iframe
        width=${width ?? DEFAULT_IFRAME_WIDTH}
        height=${height ?? DEFAULT_IFRAME_HEIGHT}
        ?allowfullscreen=${allowFullscreen}
        loading="lazy"
        frameborder="0"
        src=${ifDefined(iframeUrl)}
        allow=${ifDefined(allow)}
        referrerpolicy=${ifDefined(referrerpolicy)}
        scrolling=${ifDefined(scrolling)}
        style=${ifDefined(style)}
      ></iframe>
    `;
  };

  private readonly _renderContent = () => {
    if (this.isLoading$.value) {
      return html`<embed-iframe-loading-card
        .std=${this.std}
        .options=${this._statusCardOptions}
      ></embed-iframe-loading-card>`;
    }

    if (this.hasError$.value) {
      return html`<embed-iframe-error-card
        .error=${this.error$.value}
        .model=${this.model}
        .onRetry=${this._handleRetry}
        .std=${this.std}
        .options=${this._statusCardOptions}
      ></embed-iframe-error-card>`;
    }

    return this._renderIframe();
  };

  override connectedCallback() {
    super.connectedCallback();

    this.contentEditable = 'false';

    if (!this.model.props.iframeUrl) {
      this.doc.withoutTransact(() => {
        this.refreshData().catch(console.error);
      });
    } else {
      // update iframe options, to ensure the iframe is rendered with the correct options
      this._updateIframeOptions(this.model.props.url);
      this.status$.value = 'success';
    }

    // refresh data when original url changes
    this.disposables.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'url') {
          this.refreshData().catch(console.error);
        }
      })
    );

    // subscribe the editor host global dragging event
    // to show the overlay for the dragging area or other pointer events
    this.handleEvent(
      'dragStart',
      () => {
        this.isDraggingOnHost$.value = true;
      },
      { global: true }
    );
    this.handleEvent(
      'dragEnd',
      () => {
        this.isDraggingOnHost$.value = false;
      },
      { global: true }
    );
  }

  override renderBlock() {
    if (!this.isEmbedIframeBlockEnabled) {
      return nothing;
    }

    const containerClasses = classMap({
      'affine-embed-iframe-block-container': true,
      ...this.selectedStyle$?.value,
      'in-surface': this.inSurface,
    });
    const overlayClasses = classMap({
      'affine-embed-iframe-block-overlay': true,
      show: this.showOverlay$.value,
    });

    return html`
      <div
        draggable=${this.blockDraggable ? 'true' : 'false'}
        class=${containerClasses}
        @click=${this._handleClick}
        @dblclick=${this._handleDoubleClick}
      >
        ${this._renderContent()}

        <!-- overlay to prevent the iframe from capturing pointer events -->
        <div class=${overlayClasses}></div>
      </div>
    `;
  }

  override accessor blockContainerStyles = { margin: '18px 0' };

  override accessor useCaptionEditor = true;

  override accessor useZeroWidth = true;

  override accessor selectedStyle = SelectedStyle.Border;
}
