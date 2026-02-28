import {
  menu,
  type MenuConfig,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  DeleteIcon,
  DuplicateIcon,
  FilterIcon,
  InsertLeftIcon,
  InsertRightIcon,
  MoveLeftIcon,
  MoveRightIcon,
  SortIcon,
  ViewIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { createRef, ref } from 'lit/directives/ref.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import { renderUniLit } from '../../../../../../core';
import {
  inputConfig,
  typeConfig,
} from '../../../../../../core/common/property-menu';
import { filterTraitKey } from '../../../../../../core/filter/trait';
import { firstFilterByRef } from '../../../../../../core/filter/utils';
import { sortTraitKey } from '../../../../../../core/sort/manager';
import { createSortUtils } from '../../../../../../core/sort/utils';
import {
  draggable,
  dragHandler,
  droppable,
} from '../../../../../../core/utils/wc-dnd/dnd-context';
import type { Property } from '../../../../../../core/view-manager/property';
import { numberFormats } from '../../../../../../property-presets/number/utils/formats';
import {
  createDefaultShowQuickSettingBar,
  ShowQuickSettingBarKey,
} from '../../../../../../widget-presets/quick-setting-bar/context';
import { DEFAULT_COLUMN_TITLE_HEIGHT } from '../../../../consts';
import type { TableProperty } from '../../../../table-view-manager';
import type { VirtualTableViewUILogic } from '../../../table-view-ui-logic';
import {
  getTableGroupRect,
  getVerticalIndicator,
  startDragWidthAdjustmentBar,
} from './vertical-indicator';

export class DatabaseHeaderColumn extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    affine-database-header-column {
      display: flex;
    }

    .affine-database-header-column-grabbing * {
      cursor: grabbing;
    }
  `;

  private readonly _clickColumn = () => {
    if (this.tableViewManager.readonly$.value) {
      return;
    }
    this.popMenu();
  };

  private readonly _clickTypeIcon = (event: MouseEvent) => {
    if (this.tableViewManager.readonly$.value) {
      return;
    }
    if (this.column.type$.value === 'title') {
      return;
    }
    event.stopPropagation();
    popMenu(popupTargetFromElement(this), {
      options: {
        items: this.tableViewManager.propertyMetas$.value.map(config => {
          return menu.action({
            name: config.config.name,
            isSelected: config.type === this.column.type$.value,
            prefix: renderUniLit(config.renderer.icon),
            select: () => {
              this.column.typeSet?.(config.type);
            },
          });
        }),
      },
    });
  };

  private readonly _contextMenu = (e: MouseEvent) => {
    if (this.tableViewManager.readonly$.value) {
      return;
    }
    e.preventDefault();
    this.popMenu(e.currentTarget as HTMLElement);
  };

  private readonly _enterWidthDragBar = () => {
    if (this.tableViewManager.readonly$.value) {
      return;
    }
    if (this.drawWidthDragBarTask) {
      cancelAnimationFrame(this.drawWidthDragBarTask);
      this.drawWidthDragBarTask = 0;
    }
    this.drawWidthDragBar();
  };

  private readonly _leaveWidthDragBar = () => {
    cancelAnimationFrame(this.drawWidthDragBarTask);
    this.drawWidthDragBarTask = 0;
    getVerticalIndicator().remove();
  };

  private readonly drawWidthDragBar = () => {
    const rect = getTableGroupRect(this);
    if (!rect) {
      return;
    }
    getVerticalIndicator().display(
      this.getBoundingClientRect().right,
      rect.top,
      rect.bottom - rect.top
    );
    this.drawWidthDragBarTask = requestAnimationFrame(this.drawWidthDragBar);
  };

  private drawWidthDragBarTask = 0;

  private readonly widthDragBar = createRef();

  editTitle = () => {
    this._clickColumn();
  };

  private get readonly() {
    return this.tableViewManager.readonly$.value;
  }

  private _addFilter() {
    const filterTrait = this.tableViewManager.traitGet(filterTraitKey);
    if (!filterTrait) return;

    const filter = firstFilterByRef(this.tableViewManager.vars$.value, {
      type: 'ref',
      name: this.column.id,
    });

    filterTrait.filterSet({
      type: 'group',
      op: 'and',
      conditions: [filter, ...filterTrait.filter$.value.conditions],
    });

    this._toggleQuickSettingBar();
  }

  private _addSort(desc: boolean) {
    const sortTrait = this.tableViewManager.traitGet(sortTraitKey);
    if (!sortTrait) return;

    const sortUtils = createSortUtils(
      sortTrait,
      this.tableViewLogic.eventTrace ?? (() => {})
    );
    const sortList = sortUtils.sortList$.value;
    const existingIndex = sortList.findIndex(
      sort => sort.ref.name === this.column.id
    );

    if (existingIndex !== -1) {
      sortUtils.change(existingIndex, {
        ref: { type: 'ref', name: this.column.id },
        desc,
      });
    } else {
      sortUtils.add({
        ref: { type: 'ref', name: this.column.id },
        desc,
      });
    }

    this._toggleQuickSettingBar();
  }

  private _toggleQuickSettingBar(show = true) {
    const map = this.tableViewManager.serviceGetOrCreate(
      ShowQuickSettingBarKey,
      createDefaultShowQuickSettingBar
    );
    map.value = {
      ...map.value,
      [this.tableViewManager.id]: show,
    };
  }

  private popMenu(ele?: HTMLElement) {
    const enableNumberFormatting =
      this.tableViewManager.featureFlags$.value.enable_number_formatting;

    popMenu(popupTargetFromElement(ele ?? this), {
      options: {
        items: [
          inputConfig(this.column),
          typeConfig(this.column),
          // Number format begin
          ...(enableNumberFormatting
            ? [
                menu.subMenu({
                  name: 'Number Format',
                  hide: () =>
                    !this.column.dataUpdate ||
                    this.column.type$.value !== 'number',
                  options: {
                    items: [
                      numberFormatConfig(this.column),
                      ...numberFormats.map(format => {
                        const data = this.column.data$.value;
                        return menu.action({
                          isSelected: data.format === format.type,
                          prefix: html`<span
                            style="font-size: var(--affine-font-base); scale: 1.2;"
                            >${format.symbol}</span
                          >`,
                          name: format.label,
                          select: () => {
                            if (data.format === format.type) return;
                            this.column.dataUpdate(() => ({
                              format: format.type,
                            }));
                          },
                        });
                      }),
                    ],
                  },
                }),
              ]
            : []),
          // Number format end
          menu.group({
            items: [
              menu.action({
                name: 'Hide In View',
                prefix: ViewIcon(),
                hide: () => !this.column.hideCanSet,
                select: () => {
                  this.column.hideSet(true);
                },
              }),
            ],
          }),
          menu.group({
            items: [
              menu.action({
                name: 'Filter',
                prefix: FilterIcon(),
                select: () => this._addFilter(),
              }),
              menu.action({
                name: 'Sort Ascending',
                prefix: SortIcon(),
                select: () => this._addSort(false),
              }),
              menu.action({
                name: 'Sort Descending',
                prefix: SortIcon(),
                select: () => this._addSort(true),
              }),
            ],
          }),
          menu.group({
            items: [
              menu.action({
                name: 'Insert Left Column',
                prefix: InsertLeftIcon(),
                select: () => {
                  this.tableViewManager.propertyAdd({
                    id: this.column.id,
                    before: true,
                  });
                  Promise.resolve()
                    .then(() => {
                      const pre =
                        this.previousElementSibling?.previousElementSibling;
                      if (pre instanceof DatabaseHeaderColumn) {
                        pre.editTitle();
                        pre.scrollIntoView({
                          inline: 'nearest',
                          block: 'nearest',
                        });
                      }
                    })
                    .catch(console.error);
                },
              }),
              menu.action({
                name: 'Insert Right Column',
                prefix: InsertRightIcon(),
                select: () => {
                  this.tableViewManager.propertyAdd({
                    id: this.column.id,
                    before: false,
                  });
                  Promise.resolve()
                    .then(() => {
                      const next = this.nextElementSibling?.nextElementSibling;
                      if (next instanceof DatabaseHeaderColumn) {
                        next.editTitle();
                        next.scrollIntoView({
                          inline: 'nearest',
                          block: 'nearest',
                        });
                      }
                    })
                    .catch(console.error);
                },
              }),
              menu.action({
                name: 'Move Left',
                prefix: MoveLeftIcon(),
                hide: () => this.column.isFirst$.value,
                select: () => {
                  const pre = this.column.prev$.value;
                  if (!pre) {
                    return;
                  }
                  this.column.move({
                    id: pre.id,
                    before: true,
                  });
                },
              }),
              menu.action({
                name: 'Move Right',
                prefix: MoveRightIcon(),
                hide: () => this.column.isLast$.value,
                select: () => {
                  const next = this.column.next$.value;
                  if (!next) {
                    return;
                  }
                  this.column.move({
                    id: next.id,
                    before: false,
                  });
                },
              }),
            ],
          }),
          menu.group({
            items: [
              menu.action({
                name: 'Duplicate',
                prefix: DuplicateIcon(),
                hide: () => !this.column.canDuplicate,
                select: () => {
                  this.column.duplicate?.();
                },
              }),
              menu.action({
                name: 'Delete',
                prefix: DeleteIcon(),
                hide: () => !this.column.canDelete,
                select: () => {
                  this.column.delete?.();
                },
                class: {
                  'delete-item': true,
                },
              }),
            ],
          }),
        ],
      },
    });
  }

  private widthDragStart(event: PointerEvent) {
    startDragWidthAdjustmentBar(
      event,
      this,
      this.getBoundingClientRect().width,
      this.column
    );
  }

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.add(
      this.tableViewLogic.handleEvent('dragStart', context => {
        if (this.tableViewManager.readonly$.value) {
          return;
        }
        const event = context.get('pointerState').raw;
        const target = event.target;
        if (
          target instanceof Element &&
          this.widthDragBar.value?.contains(target)
        ) {
          event.preventDefault();
          event.stopPropagation();
          this.widthDragStart(event);
          return true;
        }
        return false;
      })
    );
  }

  override render() {
    const column = this.column;
    const style = styleMap({
      height: DEFAULT_COLUMN_TITLE_HEIGHT + 'px',
    });
    const classes = classMap({
      'affine-database-column-move': true,
      [this.grabStatus]: true,
    });
    return html`
      <div
        style=${style}
        class="affine-database-column-content"
        @click="${this._clickColumn}"
        @contextmenu="${this._contextMenu}"
        ${dragHandler(column.id)}
        ${draggable(column.id)}
        ${droppable(column.id)}
      >
        ${this.readonly
          ? null
          : html` <button class="${classes}">
              <div class="hover-trigger"></div>
              <div class="control-h"></div>
              <div class="control-l"></div>
              <div class="control-r"></div>
            </button>`}
        <div class="affine-database-column-text ${column.type$.value}">
          <div
            class="affine-database-column-type-icon dv-hover"
            @click="${this._clickTypeIcon}"
          >
            <uni-lit .uni="${column.icon}"></uni-lit>
          </div>
          <div class="affine-database-column-text-content">
            <div class="affine-database-column-text-input">
              ${column.name$.value}
            </div>
          </div>
        </div>
      </div>
      <div
        ${ref(this.widthDragBar)}
        @mouseenter="${this._enterWidthDragBar}"
        @mouseleave="${this._leaveWidthDragBar}"
        style="width: 0;position: relative;height: 100%;z-index: 1;cursor: col-resize"
      >
        <div style="width: 8px;height: 100%;margin-left: -4px;"></div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor column!: TableProperty;

  @property({ attribute: false })
  accessor grabStatus: 'grabStart' | 'grabEnd' | 'grabbing' = 'grabEnd';

  @property({ attribute: false })
  accessor tableViewLogic!: VirtualTableViewUILogic;

  get tableViewManager() {
    return this.tableViewLogic.view;
  }
}

function numberFormatConfig(column: Property): MenuConfig {
  return () =>
    html` <virtual-database-number-format-bar
      .column="${column}"
    ></virtual-database-number-format-bar>`;
}

declare global {
  interface HTMLElementTagNameMap {
    'virtual-database-header-column': DatabaseHeaderColumn;
  }
}
