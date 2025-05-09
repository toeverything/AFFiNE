import { signal } from '@preact/signals-core';
import { html } from 'lit';
import { ref } from 'lit/directives/ref.js';

import { DataViewBase } from '../../core/view/data-view-base.js';
import type { DataViewTable } from './pc/table-view.js';
import type { VirtualTableView } from './pc-virtual/table-view.js';
import type { TableViewSelectionWithType } from './selection.js';
import type { TableSingleView } from './table-view-manager.js';

export class TableViewSelector extends DataViewBase<
  TableSingleView,
  TableViewSelectionWithType
> {
  tableRef$ = signal<VirtualTableView | DataViewTable>();

  // @ts-expect-error TODO: fix this
  get expose() {
    if (this.tableRef$.value) {
      return this.tableRef$.value.expose;
    }
  }

  override render() {
    const flags = this.props.view.manager.dataSource.featureFlags$.value;

    if (flags.enable_table_virtual_scroll) {
      return html`<affine-virtual-table
        ${ref(this.tableRef$)}
        .props=${this.props}
      ></affine-virtual-table>`;
    }

    return html`<affine-database-table
      ${ref(this.tableRef$)}
      .props=${this.props}
    ></affine-database-table>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-database-table-selector': TableViewSelector;
  }
}
