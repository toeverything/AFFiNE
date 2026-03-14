import { createIcon } from '../../core/utils/uni-icon.js';
import { ganttViewModel } from './define.js';
import { GanttViewUILogic } from './pc/gantt-view-ui-logic.js';

export const ganttViewMeta = ganttViewModel.createMeta({
  icon: createIcon('DatabaseTableViewIcon'),
  // @ts-expect-error fixme: typesafe
  pcLogic: () => GanttViewUILogic,
});
