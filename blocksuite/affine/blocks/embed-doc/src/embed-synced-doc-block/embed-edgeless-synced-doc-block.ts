import { toEdgelessEmbedBlock } from '@blocksuite/affine-block-embed';
import {
  EdgelessCRUDIdentifier,
  reassociateConnectorsCommand,
} from '@blocksuite/affine-block-surface';
import { type AliasInfo } from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import {
  ThemeExtensionIdentifier,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import { Bound } from '@blocksuite/global/gfx';
import { type BlockComponent, BlockStdScope } from '@blocksuite/std';
import { html, nothing } from 'lit';
import { query } from 'lit/decorators.js';
import { choose } from 'lit/directives/choose.js';
import { classMap } from 'lit/directives/class-map.js';
import { guard } from 'lit/directives/guard.js';
import { styleMap } from 'lit/directives/style-map.js';

import { EmbedSyncedDocConfigExtension } from './configs';
import { EmbedSyncedDocBlockComponent } from './embed-synced-doc-block';

export class EmbedEdgelessSyncedDocBlockComponent extends toEdgelessEmbedBlock(
  EmbedSyncedDocBlockComponent
) {
  @query('.affine-embed-synced-doc-edgeless-header-wrapper')
  accessor headerWrapper: HTMLDivElement | null = null;

  @query('affine-preview-root')
  accessor contentElement: BlockComponent | null = null;

  protected override _renderSyncedView = () => {
    const { syncedDoc, editorMode } = this;

    if (!syncedDoc) {
      console.error('Synced doc is not found');
      return html`${nothing}`;
    }

    let containerStyleMap = styleMap({
      position: 'relative',
      width: '100%',
    });
    const modelScale = this.model.props.scale ?? 1;
    const bound = Bound.deserialize(this.model.xywh);
    const width = bound.w / modelScale;
    const height = bound.h / modelScale;
    containerStyleMap = styleMap({
      width: `${width}px`,
      height: `${height}px`,
      minHeight: `${height}px`,
      transform: `scale(${modelScale})`,
      transformOrigin: '0 0',
    });

    const themeService = this.std.get(ThemeProvider);
    const themeExtension = this.std.getOptional(ThemeExtensionIdentifier);
    const appTheme = themeService.app$.value;
    let edgelessTheme = themeService.edgeless$.value;
    if (themeExtension?.getEdgelessTheme && this.syncedDoc?.id) {
      edgelessTheme = themeExtension.getEdgelessTheme(this.syncedDoc.id).value;
    }
    const theme = this.isPageMode ? appTheme : edgelessTheme;

    const scale = this.model.props.scale ?? 1;

    this.dataset.nestedEditor = '';

    const renderEditor = () => {
      return choose(editorMode, [
        [
          'page',
          () => html`
            <div class="affine-page-viewport" data-theme=${appTheme}>
              ${new BlockStdScope({
                store: syncedDoc,
                extensions: this._buildPreviewSpec('preview-page'),
              }).render()}
            </div>
          `,
        ],
        [
          'edgeless',
          () => html`
            <div class="affine-edgeless-viewport" data-theme=${edgelessTheme}>
              ${new BlockStdScope({
                store: syncedDoc,
                extensions: this._buildPreviewSpec('preview-edgeless'),
              }).render()}
            </div>
          `,
        ],
      ]);
    };

    const header =
      this.std
        .getOptional(EmbedSyncedDocConfigExtension.identifier)
        ?.edgelessHeader({
          model: this.model,
          std: this.std,
        }) ?? nothing;

    return this.renderEmbed(
      () => html`
        <div
          class=${classMap({
            'affine-embed-synced-doc-container': true,
            [editorMode]: true,
            [theme]: true,
            surface: true,
            selected: this.selected$.value,
          })}
          @click=${this._handleClick}
          style=${containerStyleMap}
          ?data-scale=${scale}
        >
          <div class="affine-embed-synced-doc-edgeless-header-wrapper">
            ${header}
          </div>
          <div class="affine-embed-synced-doc-editor">
            ${this.isPageMode && this._isEmptySyncedDoc
              ? html`
                  <div class="affine-embed-synced-doc-editor-empty">
                    <span>
                      This is a linked doc, you can add content here.
                    </span>
                  </div>
                `
              : guard([editorMode, syncedDoc], renderEditor)}
          </div>
          <div class="affine-embed-synced-doc-editor-overlay"></div>
        </div>
      `
    );
  };

  override convertToCard = (aliasInfo?: AliasInfo) => {
    const { id, store, xywh } = this.model;
    const { caption } = this.model.props;

    const style = 'vertical';
    const bound = Bound.deserialize(xywh);
    bound.w = EMBED_CARD_WIDTH[style];
    bound.h = EMBED_CARD_HEIGHT[style];

    const { addBlock } = this.std.get(EdgelessCRUDIdentifier);
    const surface = this.gfx.surface ?? undefined;
    const newId = addBlock(
      'affine:embed-linked-doc',
      {
        xywh: bound.serialize(),
        style,
        caption,
        ...this.referenceInfo,
        ...aliasInfo,
      },
      surface
    );

    this.std.command.exec(reassociateConnectorsCommand, {
      oldId: id,
      newId,
    });

    this.gfx.selection.set({
      editing: false,
      elements: [newId],
    });
    store.deleteBlock(this.model);
  };

  override renderGfxBlock() {
    const { style, xywh$ } = this.model.props;
    const bound = Bound.deserialize(xywh$.value);

    this.embedContainerStyle.width = `${bound.w}px`;
    this.embedContainerStyle.height = `${bound.h}px`;

    this.cardStyleMap = {
      display: 'block',
      width: `${EMBED_CARD_WIDTH[style]}px`,
      height: `${EMBED_CARD_HEIGHT[style]}px`,
      transform: `scale(${bound.w / EMBED_CARD_WIDTH[style]}, ${bound.h / EMBED_CARD_HEIGHT[style]})`,
      transformOrigin: '0 0',
    };

    return this.renderPageContent();
  }

  override accessor useCaptionEditor = true;
}
