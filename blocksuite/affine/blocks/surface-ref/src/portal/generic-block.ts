import type {
  AttachmentBlockModel,
  BookmarkBlockModel,
  EmbedFigmaModel,
  EmbedGithubModel,
  EmbedHtmlModel,
  EmbedLinkedDocModel,
  EmbedLoomModel,
  EmbedSyncedDocModel,
  EmbedYoutubeModel,
  ImageBlockModel,
} from '@blocksuite/affine-model';
import { Bound } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';
import { css, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

export class SurfaceRefGenericBlockPortal extends WithDisposable(
  ShadowlessElement
) {
  static override styles = css`
    surface-ref-generic-block-portal {
      position: relative;
    }
  `;

  override firstUpdated() {
    this.disposables.add(
      this.model.propsUpdated.subscribe(() => this.requestUpdate())
    );
  }

  override render() {
    const { model, index } = this;
    const bound = Bound.deserialize(model.xywh);
    const style = {
      position: 'absolute',
      zIndex: `${index}`,
      width: `${bound.w}px`,
      height: `${bound.h}px`,
      transform: `translate(${bound.x}px, ${bound.y}px)`,
    };

    return html`
      <div
        style=${styleMap(style)}
        data-portal-reference-block-id="${model.id}"
      >
        ${this.renderModel(model)}
      </div>
    `;
  }

  @property({ attribute: false })
  accessor index!: number;

  @property({ attribute: false })
  accessor model!:
    | ImageBlockModel
    | AttachmentBlockModel
    | BookmarkBlockModel
    | EmbedGithubModel
    | EmbedYoutubeModel
    | EmbedFigmaModel
    | EmbedLinkedDocModel
    | EmbedSyncedDocModel
    | EmbedHtmlModel
    | EmbedLoomModel;

  @property({ attribute: false })
  accessor renderModel!: (model: BlockModel) => TemplateResult;
}

declare global {
  interface HTMLElementTagNameMap {
    'surface-ref-generic-block-portal': SurfaceRefGenericBlockPortal;
  }
}
