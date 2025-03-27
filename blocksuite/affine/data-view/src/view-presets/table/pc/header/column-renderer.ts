import { ShadowlessElement } from '@blocksuite/block-std';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import type { GroupData } from '../../../../core/group-by/trait.js';
import type { TableColumn, TableSingleView } from '../../table-view-manager.js';

export class DataViewColumnPreview extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    affine-data-view-column-preview {
      pointer-events: none;
      display: block;
      position: fixed;
      font-family: var(--affine-font-family);
    }
  `;

  get tableViewManager(): TableSingleView {
    return this.column.view as TableSingleView;
  }

  private renderGroup(rows: string[]) {
    const columnIndex = this.tableViewManager.propertyIndexGet(this.column.id);
    return html`
      <div
        style="background-color: var(--affine-background-primary-color);border-top: 1px solid ${unsafeCSS(
          cssVarV2.layer.insideBorder.border
        )};box-shadow: var(--affine-shadow-2);"
      >
        <affine-database-header-column
          .tableViewManager="${this.tableViewManager}"
          .column="${this.column}"
        ></affine-database-header-column>
        ${repeat(rows, (id, index) => {
          const height = this.container.querySelector(
            `affine-database-cell-container[data-row-id="${id}"]`
          )?.clientHeight;
          const style = styleMap({
            height: height + 'px',
          });
          return html`<div
            style="border-top: 1px solid ${unsafeCSS(
              cssVarV2.layer.insideBorder.border
            )}"
          >
            <div style="${style}">
              <affine-database-cell-container
                .column="${this.column}"
                .view="${this.tableViewManager}"
                .rowId="${id}"
                .columnId="${this.column.id}"
                .rowIndex="${index}"
                .columnIndex="${columnIndex}"
              ></affine-database-cell-container>
            </div>
          </div>`;
        })}
      </div>
      <div style="height: 45px;"></div>
    `;
  }

  override render() {
    return this.renderGroup(
      this.group?.rows ?? this.tableViewManager.rows$.value
    );
  }

  @property({ attribute: false })
  accessor column!: TableColumn;

  @property({ attribute: false })
  accessor container!: HTMLElement;

  @property({ attribute: false })
  accessor group: GroupData | undefined = undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-column-preview': DataViewColumnPreview;
  }
}
