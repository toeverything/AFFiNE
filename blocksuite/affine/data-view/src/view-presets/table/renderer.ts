import './pc-virtual/effect.js';
import './pc/effect.js';

import { createIcon } from '../../core/utils/uni-icon.js';
import { tableViewModel } from './define.js';
import { MobileTableViewUILogic } from './mobile/table-view-ui-logic.js';
import { TableViewUILogic } from './pc/table-view-ui-logic.js';
import { VirtualTableViewUILogic } from './pc-virtual/table-view-ui-logic';

export const tableViewMeta = tableViewModel.createMeta({
  icon: createIcon('DatabaseTableViewIcon'),
  pcLogic: view =>
    // @ts-expect-error fixme: typesafe
    view.manager.dataSource.featureFlags$.value.enable_table_virtual_scroll
      ? VirtualTableViewUILogic
      : TableViewUILogic,
  // @ts-expect-error fixme: typesafe
  mobileLogic: () => MobileTableViewUILogic,
});
