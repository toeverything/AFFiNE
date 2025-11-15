import { MobileKanbanCard } from './card.js';
import { MobileKanbanCell } from './cell.js';
import { MobileKanbanGroup } from './group.js';
import { MobileKanbanViewUI } from './kanban-view-ui-logic.js';

export function mobileEffects() {
  customElements.define('mobile-kanban-card', MobileKanbanCard);
  customElements.define('mobile-kanban-cell', MobileKanbanCell);
  customElements.define('mobile-kanban-group', MobileKanbanGroup);
  customElements.define('mobile-data-view-kanban-ui', MobileKanbanViewUI);
}
