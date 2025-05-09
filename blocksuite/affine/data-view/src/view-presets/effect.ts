import { DataViewKanban, TableViewSelector } from './index.js';
import { MobileKanbanCard } from './kanban/mobile/card.js';
import { MobileKanbanCell } from './kanban/mobile/cell.js';
import { MobileKanbanGroup } from './kanban/mobile/group.js';
import { MobileDataViewKanban } from './kanban/mobile/kanban-view.js';
import { KanbanCard } from './kanban/pc/card.js';
import { KanbanCell } from './kanban/pc/cell.js';
import { KanbanGroup } from './kanban/pc/group.js';
import { KanbanHeader } from './kanban/pc/header.js';
import { MobileTableCell } from './table/mobile/cell.js';
import { MobileTableColumnHeader } from './table/mobile/column-header.js';
import { MobileTableGroup } from './table/mobile/group.js';
import { MobileTableHeader } from './table/mobile/header.js';
import { MobileTableRow } from './table/mobile/row.js';
import { MobileDataViewTable } from './table/mobile/table-view.js';
import { pcEffects } from './table/pc/effect.js';
import { pcVirtualEffects } from './table/pc-virtual/effect.js';
import { DataBaseColumnStats } from './table/stats/column-stats-bar.js';
import { DatabaseColumnStatsCell } from './table/stats/column-stats-column.js';

export function viewPresetsEffects() {
  customElements.define('affine-data-view-kanban-card', KanbanCard);
  customElements.define('mobile-kanban-card', MobileKanbanCard);
  customElements.define('affine-data-view-kanban-cell', KanbanCell);
  customElements.define('mobile-kanban-cell', MobileKanbanCell);
  customElements.define('affine-data-view-kanban-group', KanbanGroup);
  customElements.define('mobile-kanban-group', MobileKanbanGroup);
  customElements.define('affine-data-view-kanban', DataViewKanban);
  customElements.define('mobile-data-view-kanban', MobileDataViewKanban);
  customElements.define('affine-data-view-kanban-header', KanbanHeader);

  customElements.define('mobile-table-cell', MobileTableCell);
  customElements.define('mobile-table-group', MobileTableGroup);
  customElements.define('mobile-data-view-table', MobileDataViewTable);
  customElements.define('mobile-table-header', MobileTableHeader);
  customElements.define('mobile-table-column-header', MobileTableColumnHeader);
  customElements.define('mobile-table-row', MobileTableRow);

  customElements.define('affine-database-column-stats', DataBaseColumnStats);
  customElements.define(
    'affine-database-column-stats-cell',
    DatabaseColumnStatsCell
  );
  customElements.define('affine-database-table-selector', TableViewSelector);

  pcEffects();
  pcVirtualEffects();
}
