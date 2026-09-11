import { I18n } from '@affine/i18n';
import { BlockComponent } from '@blocksuite/affine/std';
import { html } from 'lit';

import { detach } from '../../detach';
import { resolveBlobSrc, revokeObjectUrl } from './blob';
import type { SketchBlockModel } from './model';
import { sketchBlockStyles } from './styles';

export class SketchPreviewBlockComponent extends BlockComponent<SketchBlockModel> {
  static override styles = sketchBlockStyles;

  private _url?: string;

  override connectedCallback() {
    super.connectedCallback();
    detach(this.refresh());
    this.disposables.add(
      this.model.propsUpdated.subscribe(() => detach(this.refresh()))
    );
  }

  override disconnectedCallback() {
    revokeObjectUrl(this._url);
    super.disconnectedCallback();
  }

  private async refresh() {
    revokeObjectUrl(this._url);
    this._url = undefined;
    const src = await resolveBlobSrc(
      this.model.store,
      this.model.props.snapshotSvgBlobId
    );
    this._url = src?.startsWith('blob:') ? src : undefined;
    this.requestUpdate();
    this._previewSrc = src;
  }

  private _previewSrc?: string;

  override renderBlock() {
    const title =
      this.model.props.title?.toString() ||
      I18n['com.affine.whiteboard.sketch.title']();
    return html`
      <div class="wb-sketch">
        <div class="wb-sketch__header">
          <div class="wb-sketch__title">${title}</div>
          <div class="wb-sketch__kicker">
            ${I18n['com.affine.whiteboard.sketch.preview-label']()}
          </div>
        </div>
        <div class="wb-sketch__body">
          ${
            this._previewSrc
              ? html`<img
                  class="wb-sketch__snapshot"
                  src=${this._previewSrc}
                  alt=${title}
                />`
              : html`<div class="wb-sketch__placeholder">
                  ${I18n['com.affine.whiteboard.sketch.preview-label']()}
                </div>`
          }
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wb-sketch-preview': SketchPreviewBlockComponent;
  }
}
