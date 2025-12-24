import { KanbanViewUI } from '../../kanban/pc/kanban-view-ui-logic';
import { DragToFillElement } from './controller/drag-to-fill';
import { SelectionElement } from './controller/selection';
import { TableGroupFooter } from './group/bottom/group-footer';
import { VirtualDataBaseColumnStats } from './group/bottom/stats/column-stats-bar';
import { VirtualDatabaseColumnStatsCell } from './group/bottom/stats/column-stats-column';
import { TableGroupHeader } from './group/top/group-header';
import { VirtualTableHeader } from './group/top/header/column-header';
import { DataViewColumnPreview } from './group/top/header/column-move-preview';
import { DatabaseNumberFormatBar } from './group/top/header/number-format-bar';
import { DatabaseHeaderColumn } from './group/top/header/single-column-header';
import { TableVerticalIndicator } from './group/top/header/vertical-indicator';
import { DatabaseCellContainer } from './row/cell';
import { TableRowHeader } from './row/row-header';
import { TableRowLast } from './row/row-last';
import { TableViewUI } from './table-view-ui-logic';
import { VirtualElementWrapper } from './virtual/virtual-cell';

export function pcVirtualEffects() {
  customElements.define('dv-table-view-ui-virtual', TableViewUI);
  customElements.define('dv-kanban-view-ui', KanbanViewUI);
  customElements.define(
    'affine-database-virtual-cell-container',
    DatabaseCellContainer
  );
  customElements.define('virtual-table-header', VirtualTableHeader);
  customElements.define(
    'virtual-data-view-column-preview',
    DataViewColumnPreview
  );
  customElements.define('virtual-database-header-column', DatabaseHeaderColumn);
  customElements.define(
    'virtual-database-number-format-bar',
    DatabaseNumberFormatBar
  );
  customElements.define('data-view-table-row-header', TableRowHeader);
  customElements.define('data-view-table-row-last', TableRowLast);
  customElements.define('data-view-virtual-table-selection', SelectionElement);
  customElements.define('data-view-virtual-drag-to-fill', DragToFillElement);
  customElements.define(
    'data-view-virtual-table-vertical-indicator',
    TableVerticalIndicator
  );
  customElements.define('virtual-element-wrapper', VirtualElementWrapper);
  customElements.define(
    'affine-database-virtual-column-stats',
    VirtualDataBaseColumnStats
  );
  customElements.define(
    'affine-database-virtual-column-stats-cell',
    VirtualDatabaseColumnStatsCell
  );
  customElements.define('virtual-table-group-header', TableGroupHeader);
  customElements.define('virtual-table-group-footer', TableGroupFooter);
}
