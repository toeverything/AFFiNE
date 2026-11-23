import { popupTargetFromElement } from '@blocksuite/affine-components/context-menu';
import { SortIcon } from '@blocksuite/icons/lit';
import { html } from 'lit';

import { sortTraitKey } from '../../../core/sort/manager.js';
import { createSortUtils } from '../../../core/sort/utils.js';
import type { DataViewWidgetProps } from '../../../core/widget/types.js';
import { popSortRoot } from './root-panel.js';

export const renderSortBar = (props: DataViewWidgetProps) => {
  const sortTrait = props.dataViewLogic.view.traitGet(sortTraitKey);
  if (!sortTrait) {
    return;
  }
  const count = sortTrait.sortList$.value.length;
  if (count === 0) {
    return;
  }
  const text = count === 1 ? html`1 Sort` : html`${count} Sorts`;
  const click = (event: MouseEvent) => {
    popSortRoot(popupTargetFromElement(event.currentTarget as HTMLElement), {
      sortUtils: createSortUtils(sortTrait, props.dataViewLogic.eventTrace),
    });
  };
  return html` <data-view-component-button
    class="data-view-sort-button"
    .onClick="${click}"
    hoverType="border"
    .icon="${SortIcon()}"
    .text="${text}"
  ></data-view-component-button>`;
};
