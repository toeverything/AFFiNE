import { I18n } from '@affine/i18n';
import { BlockComponent } from '@blocksuite/affine/std';
import { html } from 'lit';
import { state } from 'lit/decorators.js';

import { detach } from '../../detach';
import type { ChartBlockModel } from './model';
import { readTitle } from './props';
import { resolveSnapshotSrc, revokeObjectUrl } from './snapshot';
import { chartBlockStyles } from './styles';

/**
 * Preview / L0 snapshot view. Must not import ECharts or React.
 */
export class ChartPreviewBlockComponent extends BlockComponent<ChartBlockModel> {
  static override styles = chartBlockStyles;

  @state()
  accessor snapshotUrl: string | undefined = undefined;

  private _objectUrl: string | undefined;

  override connectedCallback() {
    super.connectedCallback();
    detach(this.refreshSnapshot());
    this.disposables.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'snapshotBlobId' || key === 'title') {
          detach(this.refreshSnapshot());
        }
      })
    );
  }

  override disconnectedCallback() {
    revokeObjectUrl(this._objectUrl);
    super.disconnectedCallback();
  }

  private async refreshSnapshot() {
    revokeObjectUrl(this._objectUrl);
    this._objectUrl = undefined;
    const src = await resolveSnapshotSrc(
      this.model.store,
      this.model.props.snapshotBlobId$.value
    );
    this._objectUrl = src?.startsWith('blob:') ? src : undefined;
    this.snapshotUrl = src;
  }

  override renderBlock() {
    const title =
      readTitle(this.model.props.title) ||
      I18n['com.affine.whiteboard.chart.title']();

    return html`
      <div class="wb-chart">
        <div class="wb-chart__header">
          <div class="wb-chart__title">${title}</div>
        </div>
        <div class="wb-chart__body">
          ${
            this.snapshotUrl
              ? html`<img
                  class="wb-chart__snapshot"
                  src=${this.snapshotUrl}
                  alt=${title}
                />`
              : html`<div class="wb-chart__placeholder">
                  ${I18n['com.affine.whiteboard.chart.preview-label']()}
                </div>`
          }
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wb-chart-preview': ChartPreviewBlockComponent;
  }
}
