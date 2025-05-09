import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { AddCursorIcon } from '@blocksuite/icons/lit';
import { computed, signal } from '@preact/signals-core';
import { cssVarV2 } from '@toeverything/theme/v2';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import * as dv from '../../../core/common/dv.css.js';
import {
  type GroupTrait,
  groupTraitKey,
} from '../../../core/group-by/trait.js';
import { type DataViewInstance, renderUniLit } from '../../../core/index.js';
import { DataViewBase } from '../../../core/view/data-view-base.js';
import {
  type TableSingleView,
  TableViewRowSelection,
  type TableViewSelectionWithType,
} from '../../index.js';
import { LEFT_TOOL_BAR_WIDTH } from '../consts.js';
import { TableClipboardController } from './controller/clipboard.js';
import { TableDragController } from './controller/drag.js';
import { TableHotkeysController } from './controller/hotkeys.js';
import { TableSelectionController } from './controller/selection.js';
import { TableGroupFooter } from './group/bottom/group-footer';
import { TableGroupHeader } from './group/top/group-header';
import { DatabaseCellContainer } from './row/cell';
import { TableRowHeader } from './row/row-header.js';
import { TableRowLast } from './row/row-last.js';
import * as styles from './table-view.css.js';
import type {
  TableCellData,
  TableGrid,
  TableGroupData,
  TableRowData,
} from './types.js';
import {
  getScrollContainer,
  GridVirtualScroll,
} from './virtual/virtual-scroll.js';

export class VirtualTableView extends DataViewBase<
  TableSingleView,
  TableViewSelectionWithType
> {
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
      <div class="${dv.hover} ${dv.round8} ${styles.addGroup}" @click="${add}">
        <div class="${dv.icon16}" style="display:flex;">${AddCursorIcon()}</div>
        <div>New Group</div>
      </div>
    </div>`;
  };

  selectionController = new TableSelectionController(this);
  yScrollContainer: HTMLElement | undefined;

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
          const row = this.props.view.rowGetOrCreate(id);
          row.move(result.position, undefined, result.groupKey);
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

  columns$ = computed(() => {
    return [
      {
        id: 'row-header',
        width: LEFT_TOOL_BAR_WIDTH,
      },
      ...this.props.view.properties$.value.map(property => ({
        id: property.id,
        width: property.width$.value + 1,
      })),
      {
        id: 'row-last',
        width: 40,
      },
    ];
  });

  groupTrait$ = computed(() => {
    return this.props.view.traitGet(groupTraitKey);
  });

  groups$ = computed(() => {
    const groupTrait = this.groupTrait$.value;
    if (!groupTrait?.groupsDataList$.value) {
      return [
        {
          id: '',
          rows: this.props.view.rowIds$.value,
        },
      ];
    }
    return groupTrait.groupsDataList$.value.map(group => ({
      id: group.key,
      rows: group.rows.map(v => v.rowId),
    }));
  });
  virtualScroll$ = signal<TableGrid>();
  private initVirtualScroll(yScrollContainer: HTMLElement) {
    this.virtualScroll$.value = new GridVirtualScroll<
      TableGroupData,
      TableRowData,
      TableCellData
    >({
      initGroupData: group => ({
        hover$: computed(() => {
          const headerHover = group.data.headerHover$.value;
          if (headerHover) {
            return true;
          }
          const footerHover = group.data.footerHover$.value;
          if (footerHover) {
            return true;
          }
          return group.rows$.value.some(row => row.data.hover$.value);
        }),
        headerHover$: signal(false),
        footerHover$: signal(false),
      }),
      initRowData: row => ({
        hover$: computed(() => {
          return row.cells$.value.some(cell => cell.data.hover$.value);
        }),
        selected$: computed(() => {
          const selection = this.props.selection$.value;
          if (!selection || selection.selectionType !== 'row') {
            return false;
          }
          const groupId = row.group.groupId;
          return TableViewRowSelection.includes(selection, {
            id: row.rowId,
            groupKey: groupId ? groupId : undefined,
          });
        }),
      }),
      initCellData: () => ({
        hover$: signal(false),
        selected$: signal(false),
      }),
      columns$: this.columns$,
      groups$: this.groups$,
      createCell: (cell, wrapper) => {
        if (cell.columnId === 'row-header') {
          wrapper.style.borderBottom = `1px solid ${cssVarV2.database.border}`;
          const rowHeader = new TableRowHeader();
          rowHeader.view = this.props.view;
          rowHeader.gridCell = cell;
          rowHeader.tableView = this;
          return rowHeader;
        }
        if (cell.columnId === 'row-last') {
          const rowLast = new TableRowLast();
          rowLast.view = this.props.view;
          rowLast.gridCell = cell;
          rowLast.tableView = this;
          return rowLast;
        }
        const cellContainer = new DatabaseCellContainer();
        cellContainer.view = this.props.view;
        cellContainer.gridCell = cell;
        cellContainer.tableView = this;
        return cellContainer;
      },
      createGroup: {
        top: gridGroup => {
          const groupHeader = new TableGroupHeader();
          groupHeader.tableView = this;
          groupHeader.gridGroup = gridGroup;
          return groupHeader;
        },
        bottom: gridGroup => {
          const groupFooter = new TableGroupFooter();
          groupFooter.tableView = this;
          groupFooter.gridGroup = gridGroup;
          return groupFooter;
        },
      },
      fixedRowHeight$: signal(undefined),
      yScrollContainer,
    });
    requestAnimationFrame(() => {
      const virtualScroll = this.virtualScroll$.value;
      if (virtualScroll) {
        virtualScroll.init();
        this.disposables.add(() => virtualScroll.dispose());
      }
    });
  }
  private renderTable() {
    return this.virtualScroll$.value?.content;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.initVirtualScroll(getScrollContainer(this, 'y') ?? document.body);
    this.classList.add(styles.tableView);
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
      <div class="${styles.tableContainer}" style="${wrapperStyle}">
        <div class="${styles.tableBlockTable}" @wheel="${this.onWheel}">
          <div class="${styles.tableContainer2}" style="${containerStyle}">
            ${this.renderTable()}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-virtual-table': VirtualTableView;
  }
}
