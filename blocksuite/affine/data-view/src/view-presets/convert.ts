import { createViewConvert } from '../core/view/convert.js';
import { kanbanViewModel } from './kanban/index.js';
import { tableViewModel } from './table/index.js';

export const viewConverts = [
  createViewConvert(tableViewModel, kanbanViewModel, data => {
    if (data.groupBy) {
      return {
        filter: data.filter,
        groupBy: data.groupBy,
      };
    }
    return {
      filter: data.filter,
    };
  }),
  createViewConvert(kanbanViewModel, tableViewModel, data => ({
    filter: data.filter,
    groupBy: data.groupBy,
  })),
];
