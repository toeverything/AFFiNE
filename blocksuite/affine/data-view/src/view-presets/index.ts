import { kanbanViewMeta } from './kanban/index.js';
import { tableViewMeta } from './table/index.js';
import { chartViewMeta } from './chart/renderer.js';

export * from './convert.js';
export * from './kanban/index.js';
export * from './table/index.js';
export * from './chart';

export const viewPresets = {
  tableViewMeta: tableViewMeta,
  kanbanViewMeta: kanbanViewMeta,
  chartViewMeta: chartViewMeta,
};
