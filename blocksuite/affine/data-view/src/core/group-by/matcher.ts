import { createIdentifier } from '@blocksuite/global/di';

import { DataSourceKey } from '../data-source/consts.js';
import { type DataSource } from '../data-source/source.js';
import { type DataViewExtensionType } from '../extension/dataview.js';
import { Matcher_ } from '../logical/matcher.js';
import { groupByMatchers } from './define.js';
import type { GroupByConfig } from './types.js';

export const createGroupByMatcher = (list: GroupByConfig[]) => {
  return new Matcher_(list, v => v.matchType);
};

export class GroupByService {
  constructor(private readonly dataSource: DataSource) {}

  allExternalGroupByConfig(): GroupByConfig[] {
    return Array.from(
      this.dataSource.provider.getAll(GroupByConfigProvider).values()
    );
  }

  get matcher() {
    return createGroupByMatcher([
      ...this.allExternalGroupByConfig(),
      ...groupByMatchers,
    ]);
  }
}

export const GroupByProvider =
  createIdentifier<GroupByService>('GroupByService');

/**
 * @internal
 */
export const GroupByServiceExtension: DataViewExtensionType = {
  name: 'GroupByServiceExtension',
  setup({ di }) {
    di.addImpl(
      GroupByProvider,
      provider => new GroupByService(provider.get(DataSourceKey))
    );
  },
};

export function GroupByExtension(config: GroupByConfig): DataViewExtensionType {
  return {
    setup({ di }) {
      di.addValue(GroupByConfigProvider(config.name), config);
    },
  };
}

export const getGroupByService = (dataSource: DataSource) => {
  const groupBy = dataSource.serviceGet(GroupByProvider);
  if (!groupBy) {
    throw new Error('GroupByService is not available for this data source');
  }
  return groupBy;
};

export const GroupByConfigProvider =
  createIdentifier<GroupByConfig>('group-by-config');
