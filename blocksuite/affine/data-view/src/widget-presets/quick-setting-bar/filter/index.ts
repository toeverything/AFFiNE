import { IS_MOBILE } from '@blocksuite/global/env';
import { html } from 'lit';

import { filterTraitKey } from '../../../core/filter/trait.js';
import type { DataViewWidgetProps } from '../../../core/widget/types.js';

export const renderFilterBar = (props: DataViewWidgetProps) => {
  const filterTrait = props.dataViewLogic.view.traitGet(filterTraitKey);
  if (!filterTrait) {
    return;
  }
  if (!IS_MOBILE && !filterTrait.hasFilter$.value) {
    return;
  }
  return html` <filter-bar
    .vars="${filterTrait.view.vars$}"
    .filterGroup="${filterTrait.filter$}"
    .onChange="${filterTrait.filterSet}"
    .dataViewLogic="${props.dataViewLogic}"
  ></filter-bar>`;
};
