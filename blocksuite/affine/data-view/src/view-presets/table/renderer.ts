import './pc/effect.js';
import './pc-virtual/effect.js';

import { createUniComponentFromWebComponent } from '../../core/utils/uni-component/uni-component.js';
import { createIcon } from '../../core/utils/uni-icon.js';
import { tableViewModel } from './define.js';
import { MobileDataViewTable } from './mobile/table-view.js';
import { TableViewSelector } from './table-view-selector.js';

export const tableViewMeta = tableViewModel.createMeta({
  view: createUniComponentFromWebComponent(TableViewSelector),
  mobileView: createUniComponentFromWebComponent(MobileDataViewTable),
  icon: createIcon('DatabaseTableViewIcon'),
});
