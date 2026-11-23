import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';

import type { GroupBy, GroupProperty } from '../../core/common/types.js';
import type { FilterGroup } from '../../core/filter/types.js';
import type { Sort } from '../../core/sort/types.js';
import { type BasicViewDataType, viewType } from '../../core/view/data-view.js';
import { resolveKanbanGroupBy } from './group-by-utils.js';
import { KanbanSingleView } from './kanban-view-manager.js';

export const kanbanViewType = viewType('kanban');

export type KanbanViewColumn = {
  id: string;
  hide?: boolean;
};

type DataType = {
  columns: KanbanViewColumn[];
  filter: FilterGroup;
  groupBy?: GroupBy;
  sort?: Sort;
  header: {
    titleColumn?: string;
    iconColumn?: string;
    coverColumn?: string;
  };
  groupProperties: GroupProperty[];
};
export type KanbanViewData = BasicViewDataType<
  typeof kanbanViewType.type,
  DataType
>;
export const kanbanViewModel = kanbanViewType.createModel<KanbanViewData>({
  defaultName: 'Kanban View',
  dataViewManager: KanbanSingleView,
  defaultData: viewManager => {
    const groupBy = resolveKanbanGroupBy(viewManager.dataSource);
    if (!groupBy) {
      throw new BlockSuiteError(
        ErrorCode.DatabaseBlockError,
        'no groupable column found'
      );
    }

    const columns = viewManager.dataSource.properties$.value;

    return {
      columns: columns.map(id => ({
        id: id,
      })),
      filter: {
        type: 'group',
        op: 'and',
        conditions: [],
      },
      groupBy,
      header: {
        titleColumn: viewManager.dataSource.properties$.value.find(
          id => viewManager.dataSource.propertyTypeGet(id) === 'title'
        ),
        iconColumn: 'type',
      },
      groupProperties: [],
    };
  },
});
