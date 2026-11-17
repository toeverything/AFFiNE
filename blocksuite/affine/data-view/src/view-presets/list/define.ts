import {
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
} from '@blocksuite/affine-shared/utils';

import type { FilterGroup } from '../../core/filter/types.js';
import { type BasicViewDataType, viewType } from '../../core/view/data-view.js';
import { ListSingleView } from './list-view-manager.js';

const DEFAULT_HIDDEN_PROPERTY_NAMES = new Set([
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
]);

export const listViewType = viewType('list');

export type ListViewColumn = {
  id: string;
  hide?: boolean;
};

type DataType = {
  columns: ListViewColumn[];
  filter: FilterGroup;
  header: {
    titleColumn?: string;
  };
  showAdditionalFields: boolean;
  fieldLayout: 'inline' | 'aligned' | 'right';
};

export type ListViewData = BasicViewDataType<
  typeof listViewType.type,
  DataType
>;

export const listViewModel = listViewType.createModel<ListViewData>({
  defaultName: 'List View',
  dataViewManager: ListSingleView,
  defaultData: viewManager => {
    const taskStatusColumn = (
      viewManager.dataSource as {
        getTaskStatusColumn?: () => { id: string } | undefined;
      }
    ).getTaskStatusColumn?.();
    return {
      columns: viewManager.dataSource.properties$.value.map(id => ({
        id,
        hide:
          DEFAULT_HIDDEN_PROPERTY_NAMES.has(
            viewManager.dataSource.propertyNameGet(id)
          ) || id === taskStatusColumn?.id
            ? true
            : undefined,
      })),
      filter: {
        type: 'group',
        op: 'and',
        conditions: [],
      },
      header: {
        titleColumn: viewManager.dataSource.properties$.value.find(
          id => viewManager.dataSource.propertyTypeGet(id) === 'title'
        ),
      },
      showAdditionalFields: true,
      fieldLayout: 'aligned',
    };
  },
});
