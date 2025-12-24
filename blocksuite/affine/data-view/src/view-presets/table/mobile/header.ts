import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { PlusIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, type TemplateResult } from 'lit';
import { property, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import { cellDivider } from '../styles.js';
import type { TableSingleView } from '../table-view-manager.js';

export class MobileTableHeader extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .mobile-table-add-column {
      font-size: 18px;
      color: ${unsafeCSSVarV2('icon/primary')};
      margin-left: 8px;
      display: flex;
      align-items: center;
    }
  `;

  private readonly _onAddColumn = () => {
    if (this.readonly) return;
    this.tableViewManager.propertyAdd('end');
    this.editLastColumnTitle();
  };

  editLastColumnTitle = () => {
    const columns = this.querySelectorAll('mobile-table-column-header');
    const column = columns.item(columns.length - 1);
    column.editTitle();
  };

  private get readonly() {
    return this.tableViewManager.readonly$.value;
  }

  override render() {
    return html`
      ${this.renderGroupHeader?.()}
      <div class="mobile-table-header mobile-table-row">
        ${repeat(
          this.tableViewManager.properties$.value,
          column => column.id,
          (column, index) => {
            const style = styleMap({
              width: `${column.width$.value}px`,
              border: index === 0 ? 'none' : undefined,
            });
            return html`
              <mobile-table-column-header
                style="${style}"
                data-column-id="${column.id}"
                data-column-index="${index}"
                class="mobile-table-cell"
                .column="${column}"
                .tableViewManager="${this.tableViewManager}"
              ></mobile-table-column-header>
              <div class="${cellDivider}" style="height: auto;"></div>
            `;
          }
        )}
        <div @click="${this._onAddColumn}" class="mobile-table-add-column">
          ${PlusIcon()}
        </div>
        <div class="scale-div" style="width: 1px;height: 1px;"></div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor renderGroupHeader: (() => TemplateResult) | undefined;

  @query('.scale-div')
  accessor scaleDiv!: HTMLDivElement;

  @property({ attribute: false })
  accessor tableViewManager!: TableSingleView;
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-table-header': MobileTableHeader;
  }
}
