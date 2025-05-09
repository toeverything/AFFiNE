import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { AddCursorIcon } from '@blocksuite/icons/lit';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, unsafeCSS } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import type { GroupTrait } from '../../../core/group-by/trait.js';
import type { DataViewInstance } from '../../../core/index.js';
import { renderUniLit } from '../../../core/utils/uni-component/uni-component.js';
import { DataViewBase } from '../../../core/view/data-view-base.js';
import { LEFT_TOOL_BAR_WIDTH } from '../consts.js';
import type { TableViewSelectionWithType } from '../selection';
import type { TableSingleView } from '../table-view-manager.js';

export class MobileDataViewTable extends DataViewBase<
  TableSingleView,
  TableViewSelectionWithType
> {
  static override styles = css`
    .mobile-affine-database-table-wrapper {
      position: relative;
      width: 100%;
      padding-bottom: 4px;
      overflow-x: scroll;
      overflow-y: hidden;
    }

    .mobile-affine-database-table-container {
      position: relative;
      width: fit-content;
      min-width: 100%;
    }

    .cell-divider {
      width: 1px;
      height: 100%;
      background-color: ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
    }
  `;

  private readonly _addRow = (
    tableViewManager: TableSingleView,
    position: InsertToPosition | number
  ) => {
    if (this.readonly) return;
    tableViewManager.rowAdd(position);
  };

  onWheel = (event: WheelEvent) => {
    if (event.metaKey || event.ctrlKey) {
      return;
    }
    const ele = event.currentTarget;
    if (ele instanceof HTMLElement) {
      if (ele.scrollWidth === ele.clientWidth) {
        return;
      }
      event.stopPropagation();
    }
  };

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
                  column.dataUpdate(
                    () =>
                      addGroup({
                        text,
                        oldData: column.data$.value,
                        dataSource: this.props.view.manager.dataSource,
                      }) as never
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

  get expose(): DataViewInstance {
    return {
      clearSelection: () => {},
      addRow: position => {
        this._addRow(this.props.view, position);
      },
      focusFirstCell: () => {},
      showIndicator: _evt => {
        return false;
      },
      hideIndicator: () => {
        // this.dragController.dropPreview.remove();
      },
      moveTo: (_id, _evt) => {
        // const result = this.dragController.getInsertPosition(evt);
        // if (result) {
        //   this.props.view.rowMove(
        //     id,
        //     result.position,
        //     undefined,
        //     result.groupKey,
        //   );
        // }
      },
      getSelection: () => {
        throw new BlockSuiteError(
          ErrorCode.DatabaseBlockError,
          'Not implemented'
        );
      },
      view: this.props.view,
      eventTrace: this.props.eventTrace,
    };
  }

  private get readonly() {
    return this.props.view.readonly$.value;
  }

  private renderTable() {
    const groups = this.props.view.groupTrait.groupsDataList$.value;
    if (groups) {
      return html`
        <div style="display:flex;flex-direction: column;gap: 16px;">
          ${repeat(
            groups,
            v => v.key,
            group => {
              return html` <mobile-table-group
                data-group-key="${group.key}"
                .dataViewEle="${this.props.dataViewEle}"
                .view="${this.props.view}"
                .viewEle="${this}"
                .group="${group}"
              ></mobile-table-group>`;
            }
          )}
          ${this.renderAddGroup(this.props.view.groupTrait)}
        </div>
      `;
    }
    return html` <mobile-table-group
      .dataViewEle="${this.props.dataViewEle}"
      .view="${this.props.view}"
      .viewEle="${this}"
    ></mobile-table-group>`;
  }

  override render() {
    const vPadding = this.props.virtualPadding$.value;
    const wrapperStyle = styleMap({
      marginLeft: `-${vPadding}px`,
      marginRight: `-${vPadding}px`,
    });
    const containerStyle = styleMap({
      paddingLeft: `${vPadding}px`,
      paddingRight: `${vPadding}px`,
    });
    return html`
      ${renderUniLit(this.props.headerWidget, {
        dataViewInstance: this.expose,
      })}
      <div class="mobile-affine-database-table-wrapper" style="${wrapperStyle}">
        <div
          class="mobile-affine-database-table-container"
          style="${containerStyle}"
          @wheel="${this.onWheel}"
        >
          ${this.renderTable()}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-data-view-table': MobileDataViewTable;
  }
}
