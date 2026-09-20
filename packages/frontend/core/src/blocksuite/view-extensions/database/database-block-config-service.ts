import {
  DatabaseBlockDataSource,
  ExternalGroupByConfigProvider,
} from '@blocksuite/affine/blocks/database';
import type { ExtensionType } from '@blocksuite/affine/store';
import { CalendarExternalSourceProvider } from '@blocksuite/data-view/view-presets';
import type { FrameworkProvider } from '@toeverything/infra';

import { createWorkspaceCalendarExternalSource } from '../../database-block/calendar/workspace-calendar-source';
import { groupByConfigList } from '../../database-block/group-by';
import { propertiesPresets } from '../../database-block/properties';

export function patchDatabaseBlockConfigService(
  framework?: FrameworkProvider
): ExtensionType {
  //TODO use service
  DatabaseBlockDataSource.externalProperties.value = propertiesPresets;
  return {
    setup: di => {
      groupByConfigList.forEach(config => {
        di.addValue(ExternalGroupByConfigProvider(config.name), config);
      });
      const source = createWorkspaceCalendarExternalSource(framework);
      di.addValue(CalendarExternalSourceProvider(source.id), source);
    },
  };
}
