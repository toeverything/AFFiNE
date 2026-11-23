import { TableViewCellContainer } from './cell.js';
import { DragToFillElement } from './controller/drag-to-fill.js';
import { SelectionElement } from './controller/selection.js';
import { TableGroup } from './group.js';
import { DatabaseColumnHeader } from './header/column-header.js';
import { DataViewColumnPreview } from './header/column-renderer.js';
import { DatabaseHeaderColumn } from './header/database-header-column.js';
import { DatabaseNumberFormatBar } from './header/number-format-bar.js';
import { TableVerticalIndicator } from './header/vertical-indicator.js';
import { TableRowView } from './row/row.js';
import { RowSelectCheckbox } from './row/row-select-checkbox.js';
import { TableViewUI } from './table-view-ui-logic.js';

export function pcEffects() {
  customElements.define('dv-table-view-ui', TableViewUI);
  customElements.define('affine-data-view-table-group', TableGroup);
  customElements.define('dv-table-view-cell-container', TableViewCellContainer);
  customElements.define('affine-database-column-header', DatabaseColumnHeader);
  customElements.define(
    'affine-data-view-column-preview',
    DataViewColumnPreview
  );
  customElements.define('affine-database-header-column', DatabaseHeaderColumn);
  customElements.define(
    'affine-database-number-format-bar',
    DatabaseNumberFormatBar
  );
  customElements.define('data-view-table-row', TableRowView);
  customElements.define('row-select-checkbox', RowSelectCheckbox);
  customElements.define('data-view-table-selection', SelectionElement);
  customElements.define('data-view-drag-to-fill', DragToFillElement);
  customElements.define(
    'data-view-table-vertical-indicator',
    TableVerticalIndicator
  );
}
