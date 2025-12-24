import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { AddCursorIcon } from '@blocksuite/icons/lit';
import { signal } from '@preact/signals-core';
import type { TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import type { GroupTrait } from '../../../core/group-by/trait.js';
import {
  createUniComponentFromWebComponent,
  renderUniLit,
} from '../../../core/index.js';
import {
  DataViewUIBase,
  DataViewUILogicBase,
} from '../../../core/view/data-view-base.js';
import { LEFT_TOOL_BAR_WIDTH } from '../consts.js';
import type { TableViewSelectionWithType } from '../selection';
import type { TableSingleView } from '../table-view-manager.js';
import {
  mobileTableViewContainer,
  mobileTableViewWrapper,
} from './table-view-style.js';

export class MobileTableViewUILogic extends DataViewUILogicBase<
  TableSingleView,
  TableViewSelectionWithType
> {
  ui$ = signal<MobileTableViewUI | undefined>(undefined);

  private get readonly() {
    return this.view.readonly$.value;
  }

  clearSelection = () => {};

  addRow = (position: InsertToPosition) => {
    if (this.readonly) return;
    return this.view.rowAdd(position);
  };

  focusFirstCell = () => {};

  showIndicator = (_evt: MouseEvent) => {
    return false;
  };

  hideIndicator = () => {};

  moveTo = () => {};

  renderAddGroup = (groupHelper: GroupTrait) => {
    const addGroup = groupHelper.addGroup;
    if (!addGroup) {
      return;
    }
    const add = (e: MouseEvent) => {
      const ele = e.currentTarget as HTMLElement;
      popMenu(popupTargetFromElement(ele), {
        options: {
          items: [
            menu.input({
              onComplete: text => {
                const column = groupHelper.property$.value;
                if (column) {
                  column.dataUpdate(() =>
                    addGroup({
                      text,
                      oldData: column.data$.value,
                      dataSource: this.view.manager.dataSource,
                    })
                  );
                }
              },
            }),
          ],
        },
      });
    };
    return html` <div style="display:flex;">
      <div
        class="dv-hover dv-round-8"
        style="display:flex;align-items:center;gap: 10px;padding: 6px 12px 6px 8px;color: var(--affine-text-secondary-color);font-size: 12px;line-height: 20px;position: sticky;left: ${LEFT_TOOL_BAR_WIDTH}px;"
        @click="${add}"
      >
        <div class="dv-icon-16" style="display:flex;">${AddCursorIcon()}</div>
        <div>New Group</div>
      </div>
    </div>`;
  };

  renderer = createUniComponentFromWebComponent(MobileTableViewUI);
}

export class MobileTableViewUI extends DataViewUIBase<MobileTableViewUILogic> {
  override connectedCallback(): void {
    super.connectedCallback();
    this.logic.ui$.value = this;
    this.classList.add(mobileTableViewWrapper);
  }

  private renderTable() {
    const groups = this.logic.view.groupTrait.groupsDataList$.value;
    if (groups) {
      const groupEntries = groups.filter(
        (group): group is NonNullable<(typeof groups)[number]> => group != null
      );
      return html`
        <div style="display:flex;flex-direction: column;gap: 16px;">
          ${repeat(
            groupEntries,
            v => v.key,
            group => {
              return html` <mobile-table-group
                data-group-key="${group.key}"
                .tableViewLogic="${this.logic}"
                .group="${group}"
              ></mobile-table-group>`;
            }
          )}
          ${this.logic.renderAddGroup(this.logic.view.groupTrait)}
        </div>
      `;
    }
    return html` <mobile-table-group
      .tableViewLogic="${this.logic}"
    ></mobile-table-group>`;
  }

  override render(): TemplateResult {
    const vPadding = this.logic.root.config.virtualPadding$.value;
    const wrapperStyle = styleMap({
      marginLeft: `-${vPadding}px`,
      marginRight: `-${vPadding}px`,
    });
    const containerStyle = styleMap({
      paddingLeft: `${vPadding}px`,
      paddingRight: `${vPadding}px`,
    });
    return html`
      ${renderUniLit(this.logic.root.config.headerWidget, {
        dataViewLogic: this.logic,
      })}
      <div class="${mobileTableViewWrapper}" style="${wrapperStyle}">
        <div class="${mobileTableViewContainer}" style="${containerStyle}">
          ${this.renderTable()}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-data-view-table-ui': MobileTableViewUI;
  }
}
