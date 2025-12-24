import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { IS_MOBILE } from '@blocksuite/global/env';
import { html, nothing } from 'lit';

import {
  type DataViewWidgetProps,
  defineUniComponent,
} from '../../core/index.js';
import {
  createDefaultShowQuickSettingBar,
  ShowQuickSettingBarKey,
} from './context.js';
import { renderFilterBar } from './filter/index.js';
import { renderSortBar } from './sort/index.js';

export const widgetQuickSettingBar = defineUniComponent(
  (props: DataViewWidgetProps) => {
    const view = props.dataViewLogic.view;
    const barList = [renderSortBar(props), renderFilterBar(props)].filter(
      Boolean
    );
    if (!IS_MOBILE) {
      if (
        !view.serviceGetOrCreate(
          ShowQuickSettingBarKey,
          createDefaultShowQuickSettingBar
        ).value[view.id]
      ) {
        return html``;
      }
      if (!barList.length) {
        return html``;
      }
    }
    return html` <div
      style="display: flex;margin-top: 8px;align-items: center;width: 100%;gap:8px"
    >
      ${barList.map((bar, index) => {
        return html`
          ${index !== 0
            ? html` <div
                style="width: 1px;height:27px;background-color: ${unsafeCSSVarV2(
                  'layer/insideBorder/border'
                )}"
              ></div>`
            : nothing}
          ${bar}
        `;
      })}
    </div>`;
  }
);
