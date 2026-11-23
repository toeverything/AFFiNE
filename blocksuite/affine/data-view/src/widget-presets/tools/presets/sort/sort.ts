import { popupTargetFromElement } from '@blocksuite/affine-components/context-menu';
import { IS_MOBILE } from '@blocksuite/global/env';
import { SortIcon } from '@blocksuite/icons/lit';
import { computed } from '@preact/signals-core';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { popCreateSort } from '../../../../core/sort/add-sort.js';
import { sortTraitKey } from '../../../../core/sort/manager.js';
import { createSortUtils } from '../../../../core/sort/utils.js';
import { WidgetBase } from '../../../../core/widget/widget-base.js';
import {
  createDefaultShowQuickSettingBar,
  ShowQuickSettingBarKey,
} from '../../../quick-setting-bar/context.js';
import { popSortRoot } from '../../../quick-setting-bar/sort/root-panel.js';

const styles = css`
  .affine-database-sort-button {
    display: flex;
    align-items: center;
    gap: 6px;
    line-height: 20px;
    padding: 2px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 20px;
  }

  .affine-database-sort-button:hover,
  .affine-database-sort-button.active {
    background-color: var(--affine-hover-color);
  }

  .affine-database-sort-button {
  }
`;

export class DataViewHeaderToolsSort extends WidgetBase {
  static override styles = styles;

  sortUtils$ = computed(() => {
    const sortTrait = this.view.traitGet(sortTraitKey);
    if (sortTrait) {
      return createSortUtils(sortTrait, this.dataViewLogic.eventTrace);
    }
    return;
  });

  hasSort = computed(() => {
    return (this.sortUtils$.value?.sortList$?.value?.length ?? 0) > 0;
  });

  private get readonly() {
    return this.view.readonly$.value;
  }

  private clickSort(event: MouseEvent) {
    const sortUtils = this.sortUtils$.value;
    if (!sortUtils) {
      return;
    }
    if (this.hasSort.value) {
      this.toggleShowQuickSettingBar();
      return;
    }
    popCreateSort(popupTargetFromElement(event.currentTarget as HTMLElement), {
      sortUtils: {
        ...sortUtils,
        add: sort => {
          sortUtils.add(sort);
          this.toggleShowQuickSettingBar(true);
          requestAnimationFrame(() => {
            const ele = this.closest(
              'affine-data-view-renderer'
            )?.querySelector('.data-view-sort-button');
            if (ele) {
              popSortRoot(popupTargetFromElement(ele as HTMLElement), {
                sortUtils: sortUtils,
              });
            }
          });
        },
      },
    });
    return;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.style.display = IS_MOBILE ? 'none' : 'flex';
  }

  override render() {
    if (this.readonly) return nothing;
    const style = styleMap({
      color: this.hasSort.value
        ? cssVarV2('text/emphasis')
        : cssVarV2('icon/primary'),
    });
    return html` <div
      @click="${this.clickSort}"
      style="${style}"
      class="affine-database-sort-button"
    >
      ${SortIcon()}
    </div>`;
  }

  toggleShowQuickSettingBar(show?: boolean) {
    const map = this.view.serviceGetOrCreate(
      ShowQuickSettingBarKey,
      createDefaultShowQuickSettingBar
    );
    map.value = {
      ...map.value,
      [this.view.id]: show ?? !map.value[this.view.id],
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'data-view-header-tools-sort': DataViewHeaderToolsSort;
  }
}
