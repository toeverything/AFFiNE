import './pc/effect.js';

import { createIcon } from '../../core/utils/uni-icon.js';
import type { DataViewUILogicBaseConstructor } from '../../core/view/data-view-base.js';
import { calendarViewModel } from './define.js';
import { CalendarViewUILogic } from './pc/view.js';

export const calendarViewMeta = calendarViewModel.createMeta({
  icon: createIcon('TodayIcon'),
  pcLogic: () =>
    CalendarViewUILogic as unknown as DataViewUILogicBaseConstructor,
});
