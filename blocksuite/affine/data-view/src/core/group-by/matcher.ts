import { createIdentifier } from '@blocksuite/global/di';

import type { DataSource } from '../data-source/base.js';
import { Matcher_ } from '../logical/matcher.js';
import { groupByMatchers } from './define.js';
import type { GroupByConfig } from './types.js';

export const createGroupByMatcher = (list: GroupByConfig[]) => {
  return new Matcher_(list, v => v.matchType);
};

export const findGroupByConfigByName = (
  dataSource: DataSource,
  name: string
): GroupByConfig | undefined => {
  const svc = getGroupByService(dataSource);
  const all: GroupByConfig[] = [
    ...svc.allExternalGroupByConfig(),
    ...groupByMatchers,
  ];
  return all.find(c => c.name === name);
};

export class GroupByService {
  constructor(private readonly dataSource: DataSource) {}

  allExternalGroupByConfig(): GroupByConfig[] {
    return Array.from(
      this.dataSource.provider.getAll(ExternalGroupByConfigProvider).values()
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
  createIdentifier<GroupByService>('group-by-service');

export const getGroupByService = (dataSource: DataSource) => {
  return dataSource.serviceGetOrCreate(
    GroupByProvider,
    () => new GroupByService(dataSource)
  );
};

export const ExternalGroupByConfigProvider = createIdentifier<GroupByConfig>(
  'external-group-by-config'
);
