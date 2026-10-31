import { createIcon } from '../../core/utils/uni-icon.js';
import { listViewModel } from './define.js';
import { ListViewUILogic } from './pc/list-view-ui-logic.js';

export const listViewMeta = listViewModel.createMeta({
  icon: createIcon('DatabaseListViewIcon'),
  // @ts-expect-error fixme: typesafe
  pcLogic: () => ListViewUILogic,
  // @ts-expect-error fixme: typesafe
  mobileLogic: () => ListViewUILogic,
});
