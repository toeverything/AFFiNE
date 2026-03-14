import { createViewConvert } from '../core/view/convert.js';
import { ganttViewModel } from './gantt/index.js';
import { kanbanViewModel } from './kanban/index.js';
import { tableViewModel } from './table/index.js';

export const viewConverts = [
  createViewConvert(tableViewModel, kanbanViewModel, data => ({
    filter: data.filter,
    sort: data.sort,
    groupBy: data.groupBy,
  })),
  createViewConvert(kanbanViewModel, tableViewModel, data => ({
    filter: data.filter,
    sort: data.sort,
    groupBy: data.groupBy,
  })),
  createViewConvert(tableViewModel, ganttViewModel, data => ({
    filter: data.filter,
    sort: data.sort,
  })),
  createViewConvert(ganttViewModel, tableViewModel, data => ({
    filter: data.filter,
    sort: data.sort,
  })),
  createViewConvert(kanbanViewModel, ganttViewModel, data => ({
    filter: data.filter,
    sort: data.sort,
  })),
  createViewConvert(ganttViewModel, kanbanViewModel, data => ({
    filter: data.filter,
    sort: data.sort,
  })),
];
