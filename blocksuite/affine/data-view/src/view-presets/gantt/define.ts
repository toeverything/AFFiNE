import type { FilterGroup } from '../../core/filter/types.js';
import type { Sort } from '../../core/sort/types.js';
import { type BasicViewDataType, viewType } from '../../core/view/data-view.js';
import { GanttSingleView } from './gantt-view-manager.js';

export const ganttViewType = viewType('gantt');

export type GanttViewColumn = {
  id: string;
  hide?: boolean;
};

export type GanttTimeScale = 'day' | 'week' | 'month';

type DataType = {
  columns: GanttViewColumn[];
  filter: FilterGroup;
  sort?: Sort;
  startDateColumnId?: string;
  endDateColumnId?: string;
  timeScale: GanttTimeScale;
  header: {
    titleColumn?: string;
    iconColumn?: string;
  };
};

export type GanttViewData = BasicViewDataType<
  typeof ganttViewType.type,
  DataType
>;

export const ganttViewModel = ganttViewType.createModel<GanttViewData>({
  defaultName: 'Gantt View',
  dataViewManager: GanttSingleView,
  defaultData: viewManager => {
    const ds = viewManager.dataSource;

    // Auto-detect date columns
    const dateColumnIds = ds.properties$.value.filter(
      id => ds.propertyTypeGet(id) === 'date'
    );

    let startDateColumnId = dateColumnIds[0];
    let endDateColumnId = dateColumnIds[1];

    // If fewer than 2 date columns exist, create them
    if (!startDateColumnId) {
      const currentProps = ds.properties$.value;
      startDateColumnId = ds.propertyAdd(
        { before: false, id: currentProps[currentProps.length - 1] ?? '' },
        { type: 'date', name: 'Start Date' }
      );
    }
    if (!endDateColumnId) {
      endDateColumnId = ds.propertyAdd(
        { before: false, id: startDateColumnId ?? '' },
        { type: 'date', name: 'End Date' }
      );
    }

    // Re-read after potential mutations
    const allProperties = ds.properties$.value;
    return {
      columns: allProperties.map(id => ({ id })),
      filter: {
        type: 'group',
        op: 'and',
        conditions: [],
      },
      startDateColumnId,
      endDateColumnId,
      timeScale: 'day',
      header: {
        titleColumn: allProperties.find(
          id => ds.propertyTypeGet(id) === 'title'
        ),
        iconColumn: 'type',
      },
    };
  },
});
