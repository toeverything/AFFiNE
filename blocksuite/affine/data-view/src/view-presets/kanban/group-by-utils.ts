import { nanoid } from '@blocksuite/store';

import type { GroupBy } from '../../core/common/types.js';
import { getTagColor } from '../../core/component/tags/colors.js';
import type { DataSource } from '../../core/data-source/base.js';
import { defaultGroupBy } from '../../core/group-by/default.js';
import { getGroupByService } from '../../core/group-by/matcher.js';

type KanbanGroupCapability = 'mutable' | 'immutable' | 'none';

const KANBAN_DEFAULT_STATUS_OPTIONS = ['Todo', 'In Progress', 'Done'];
const SHOW_EMPTY_GROUPS_BY_DEFAULT = new Set(['select', 'multi-select']);

export const getKanbanDefaultHideEmpty = (groupName?: string): boolean => {
  return !groupName || !SHOW_EMPTY_GROUPS_BY_DEFAULT.has(groupName);
};

const getKanbanGroupCapability = (
  dataSource: DataSource,
  propertyId: string
): KanbanGroupCapability => {
  const type = dataSource.propertyTypeGet(propertyId);
  if (!type) {
    return 'none';
  }

  const meta = dataSource.propertyMetaGet(type);
  const kanbanGroup = meta?.config.kanbanGroup;
  if (!kanbanGroup?.enabled) {
    return 'none';
  }
  return kanbanGroup.mutable ? 'mutable' : 'immutable';
};

const hasMatchingGroupBy = (dataSource: DataSource, propertyId: string) => {
  const dataType = dataSource.propertyDataTypeGet(propertyId);
  if (!dataType) {
    return false;
  }
  const groupByService = getGroupByService(dataSource);
  return !!groupByService?.matcher.match(dataType);
};

const createGroupByFromColumn = (
  dataSource: DataSource,
  columnId: string
): GroupBy | undefined => {
  const type = dataSource.propertyTypeGet(columnId);
  if (!type) {
    return;
  }
  const meta = dataSource.propertyMetaGet(type);
  if (!meta) {
    return;
  }
  return defaultGroupBy(
    dataSource,
    meta,
    columnId,
    dataSource.propertyDataGet(columnId)
  );
};

export const canGroupable = (dataSource: DataSource, propertyId: string) => {
  return (
    getKanbanGroupCapability(dataSource, propertyId) !== 'none' &&
    hasMatchingGroupBy(dataSource, propertyId)
  );
};

export const pickKanbanGroupColumn = (
  dataSource: DataSource,
  propertyIds: string[] = dataSource.properties$.value
): string | undefined => {
  let immutableFallback: string | undefined;

  for (const propertyId of propertyIds) {
    const capability = getKanbanGroupCapability(dataSource, propertyId);
    if (capability === 'none' || !hasMatchingGroupBy(dataSource, propertyId)) {
      continue;
    }
    if (capability === 'mutable') {
      return propertyId;
    }
    immutableFallback ??= propertyId;
  }

  return immutableFallback;
};

export const ensureKanbanGroupColumn = (
  dataSource: DataSource
): string | undefined => {
  const columnId = pickKanbanGroupColumn(dataSource);
  if (columnId) {
    return columnId;
  }

  const statusId = dataSource.propertyAdd('end', {
    type: 'select',
    name: 'Status',
  });
  if (!statusId) {
    return;
  }

  dataSource.propertyDataSet(statusId, {
    options: KANBAN_DEFAULT_STATUS_OPTIONS.map(value => ({
      id: nanoid(),
      value,
      color: getTagColor(),
    })),
  });

  return statusId;
};

export const resolveKanbanGroupBy = (
  dataSource: DataSource,
  current?: GroupBy
): GroupBy | undefined => {
  const keepColumnId =
    current?.columnId && canGroupable(dataSource, current.columnId)
      ? current.columnId
      : undefined;

  const columnId = keepColumnId ?? ensureKanbanGroupColumn(dataSource);
  if (!columnId) {
    return;
  }

  const next = createGroupByFromColumn(dataSource, columnId);
  if (!next) {
    return;
  }

  return {
    ...next,
    sort: current?.sort,
    hideEmpty: current?.hideEmpty ?? getKanbanDefaultHideEmpty(next.name),
  };
};
