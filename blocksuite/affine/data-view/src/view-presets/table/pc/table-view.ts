import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
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
import { TableClipboardController } from './controller/clipboard.js';
import { TableDragController } from './controller/drag.js';
import { TableHotkeysController } from './controller/hotkeys.js';
import { TableSelectionController } from './controller/selection.js';

const styles = css`
  affine-database-table {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  affine-database-table * {
    box-sizing: border-box;
  }

  .affine-database-table {
    overflow-y: auto;
  }

  .affine-database-block-title-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 44px;
    margin: 2px 0 2px;
  }

  .affine-database-block-table {
    position: relative;
    width: 100%;
    padding-bottom: 4px;
    z-index: 1;
    overflow-x: scroll;
    overflow-y: hidden;
  }

  /* Disable horizontal scrolling to prevent crashes on iOS Safari */
  affine-edgeless-root .affine-database-block-table {
    @media (pointer: coarse) {
      overflow: hidden;
    }
    @media (pointer: fine) {
      overflow-x: scroll;
      overflow-y: hidden;
    }
  }

  .affine-database-block-table:hover {
    padding-bottom: 0px;
  }

  .affine-database-block-table::-webkit-scrollbar {
    -webkit-appearance: none;
    display: block;
  }

  .affine-database-block-table::-webkit-scrollbar:horizontal {
    height: 4px;
  }

  .affine-database-block-table::-webkit-scrollbar-thumb {
    border-radius: 2px;
    background-color: transparent;
  }

  .affine-database-block-table:hover::-webkit-scrollbar:horizontal {
    height: 8px;
  }

  .affine-database-block-table:hover::-webkit-scrollbar-thumb {
    border-radius: 16px;
    background-color: var(--affine-black-30);
  }

  .affine-database-block-table:hover::-webkit-scrollbar-track {
    background-color: var(--affine-hover-color);
  }

  .affine-database-table-container {
    position: relative;
    width: fit-content;
    min-width: 100%;
  }

  .affine-database-block-tag-circle {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
  }

  .affine-database-block-tag {
    display: inline-flex;
    border-radius: 11px;
    align-items: center;
    padding: 0 8px;
    cursor: pointer;
  }

  .cell-divider {
    width: 1px;
    height: 100%;
    background-color: ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
  }

  .data-view-table-left-bar {
    display: flex;
    align-items: center;
    position: sticky;
    z-index: 1;
    left: 0;
    width: ${LEFT_TOOL_BAR_WIDTH}px;
    flex-shrink: 0;
  }

  .affine-database-block-rows {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
  }
`;

export class DataViewTable extends DataViewBase<
  TableSingleView,
  TableViewSelectionWithType
> {
  static override styles = styles;

  clipboardController = new TableClipboardController(this);

  dragController = new TableDragController(this);

  hotkeysController = new TableHotkeysController(this);

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

  selectionController = new TableSelectionController(this);

  get expose(): DataViewInstance {
    return {
      clearSelection: () => {
        this.selectionController.clear();
      },
      addRow: position => {
        if (this.readonly) return;
        const rowId = this.props.view.rowAdd(position);
        if (rowId) {
          this.props.dataViewEle.openDetailPanel({
            view: this.props.view,
            rowId,
          });
        }
        return rowId;
      },
      focusFirstCell: () => {
        this.selectionController.focusFirstCell();
      },
      showIndicator: evt => {
        return this.dragController.showIndicator(evt) != null;
      },
      hideIndicator: () => {
        this.dragController.dropPreview.remove();
      },
      moveTo: (id, evt) => {
        const result = this.dragController.getInsertPosition(evt);
        if (result) {
          this.props.view.rowMove(
            id,
            result.position,
            undefined,
            result.groupKey
          );
        }
      },
      getSelection: () => {
        return this.selectionController.selection;
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
              return html` <affine-data-view-table-group
                data-group-key="${group.key}"
                .dataViewEle="${this.props.dataViewEle}"
                .view="${this.props.view}"
                .viewEle="${this}"
                .group="${group}"
              ></affine-data-view-table-group>`;
            }
          )}
          ${this.renderAddGroup(this.props.view.groupTrait)}
        </div>
      `;
    }
    return html` <affine-data-view-table-group
      .dataViewEle="${this.props.dataViewEle}"
      .view="${this.props.view}"
      .viewEle="${this}"
    ></affine-data-view-table-group>`;
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
      <div class="affine-database-table" style="${wrapperStyle}">
        <div class="affine-database-block-table" @wheel="${this.onWheel}">
          <div
            class="affine-database-table-container"
            style="${containerStyle}"
          >
            ${this.renderTable()}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-database-table': DataViewTable;
  }
}
