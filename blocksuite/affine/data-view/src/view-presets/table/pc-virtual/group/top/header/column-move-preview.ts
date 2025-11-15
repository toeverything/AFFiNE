import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import type { Group } from '../../../../../../core/group-by/trait';
import type { Row } from '../../../../../../core/view-manager/row';
import type {
  TableProperty,
  TableSingleView,
} from '../../../../table-view-manager';
import type { VirtualTableViewUILogic } from '../../../table-view-ui-logic';

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
    return this.tableViewLogic.view;
  }

  private renderGroup(rows: Row[]) {
    const columnIndex = this.column.index$.value;
    return html`
      <div
        style="background-color: var(--affine-background-primary-color);border-top: 1px solid ${unsafeCSS(
          cssVarV2.layer.insideBorder.border
        )};box-shadow: var(--affine-shadow-2);"
      >
        <affine-database-header-column
          .tableViewLogic="${this.tableViewLogic}"
          .column="${this.column}"
        ></affine-database-header-column>
        ${repeat(rows, (id, index) => {
          const height = this.container.querySelector(
            `dv-table-view-cell-container[data-row-id="${id}"]`
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
              <dv-table-view-cell-container
                .column="${this.column}"
                .tableViewLogic="${this.tableViewLogic}"
                .rowId="${id}"
                .columnId="${this.column.id}"
                .rowIndex="${index}"
                .columnIndex="${columnIndex}"
              ></dv-table-view-cell-container>
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
  accessor column!: TableProperty;

  @property({ attribute: false })
  accessor container!: HTMLElement;

  @property({ attribute: false })
  accessor group: Group | undefined = undefined;

  @property({ attribute: false })
  accessor tableViewLogic!: VirtualTableViewUILogic;
}

declare global {
  interface HTMLElementTagNameMap {
    'virtual-data-view-column-preview': DataViewColumnPreview;
  }
}
