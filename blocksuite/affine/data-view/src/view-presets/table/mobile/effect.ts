import { MobileTableCell } from './cell.js';
import { MobileTableColumnHeader } from './column-header.js';
import { MobileTableGroup } from './group.js';
import { MobileTableHeader } from './header.js';
import { MobileTableRow } from './row.js';
import { MobileTableViewUI } from './table-view-ui-logic.js';

export function mobileEffects() {
  customElements.define('mobile-table-cell', MobileTableCell);
  customElements.define('mobile-table-group', MobileTableGroup);
  customElements.define('mobile-data-view-table-ui', MobileTableViewUI);
  customElements.define('mobile-table-header', MobileTableHeader);
  customElements.define('mobile-table-column-header', MobileTableColumnHeader);
  customElements.define('mobile-table-row', MobileTableRow);
}
