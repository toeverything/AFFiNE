import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { PlusIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { nothing } from 'lit';
import { property, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import type { TableSingleView } from '../../../../table-view-manager';
import * as styles from './column-header.css';

export class VirtualTableHeader extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  private readonly _onAddColumn = (e: MouseEvent) => {
    if (this.readonly) return;
    this.tableViewManager.propertyAdd('end');
    const ele = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => {
      this.editLastColumnTitle();
      ele.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  editLastColumnTitle = () => {
    const columns = this.querySelectorAll('affine-database-header-column');
    const column = columns.item(columns.length - 1);
    column.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    column.editTitle();
  };

  private get readonly() {
    return this.tableViewManager.readonly$.value;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(styles.columnHeaderContainer);
  }

  override render() {
    return html`
      <div class="${styles.columnHeader} database-row">
        ${this.readonly
          ? nothing
          : html`<div class="data-view-table-left-bar"></div>`}
        ${repeat(
          this.tableViewManager.properties$.value,
          column => column.id,
          (column, index) => {
            const style = styleMap({
              width: `${column.width$.value}px`,
              border: index === 0 ? 'none' : undefined,
            });
            return html`
              <affine-database-header-column
                style="${style}"
                data-column-id="${column.id}"
                data-column-index="${index}"
                class="${styles.column} ${styles.cell}"
                .column="${column}"
                .tableViewManager="${this.tableViewManager}"
              ></affine-database-header-column>
              <div class="cell-divider" style="height: auto;"></div>
            `;
          }
        )}
        <div
          @click="${this._onAddColumn}"
          class="${styles.headerAddColumnButton}"
        >
          ${PlusIcon()}
        </div>
        <div class="scale-div" style="width: 1px;height: 1px;"></div>
      </div>
    `;
  }

  @query('.scale-div')
  accessor scaleDiv!: HTMLDivElement;

  @property({ attribute: false })
  accessor tableViewManager!: TableSingleView;
}

declare global {
  interface HTMLElementTagNameMap {
    'virtual-table-header': VirtualTableHeader;
  }
}
