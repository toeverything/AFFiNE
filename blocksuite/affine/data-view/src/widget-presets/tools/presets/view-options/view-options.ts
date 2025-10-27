import {
  menu,
  type MenuButtonData,
  type MenuConfig,
  popMenu,
  type PopupTarget,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import {
  ArrowRightSmallIcon,
  DeleteIcon,
  DuplicateIcon,
  FilterIcon,
  GroupingIcon,
  InfoIcon,
  LayoutIcon,
  MoreHorizontalIcon,
  SortIcon,
} from '@blocksuite/icons/lit';
import {
  autoPlacement,
  type Middleware,
  offset,
  shift,
} from '@floating-ui/dom';
import { css, html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { popPropertiesSetting } from '../../../../core/common/properties.js';
import { filterTraitKey } from '../../../../core/filter/trait.js';
import {
  popGroupSetting,
  popSelectGroupByProperty,
} from '../../../../core/group-by/setting.js';
import { groupTraitKey } from '../../../../core/group-by/trait.js';
import {
  type DataViewUILogicBase,
  emptyFilterGroup,
  popCreateFilter,
  renderUniLit,
} from '../../../../core/index.js';
import { popCreateSort } from '../../../../core/sort/add-sort.js';
import { sortTraitKey } from '../../../../core/sort/manager.js';
import { createSortUtils } from '../../../../core/sort/utils.js';
import { WidgetBase } from '../../../../core/widget/widget-base.js';
import { popFilterRoot } from '../../../quick-setting-bar/filter/root-panel-view.js';
import { popSortRoot } from '../../../quick-setting-bar/sort/root-panel.js';
import type { ChartSingleView } from '../../../view-presets/chart/chart-view-manager.js';
import type { ChartType } from '../../../view-presets/chart/define.js';

const styles = css`
  .affine-database-toolbar-item.more-action {
    padding: 2px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .affine-database-toolbar-item.more-action:hover {
    background: var(--affine-hover-color);
  }

  .affine-database-toolbar-item.more-action {
    font-size: 20px;
    color: ${unsafeCSSVarV2('icon/primary')};
  }

  .more-action.active {
    background: var(--affine-hover-color);
  }
`;

const createViewOptionsMiddleware = (): Middleware[] => [
  offset(4),
  shift({
    padding: 16, // Increased padding to keep menu on-screen
    crossAxis: false, // Don't shift on cross axis to maintain alignment
  }),
  autoPlacement({
    alignment: 'start', // Align to left side to prevent off-screen issues
    allowedPlacements: ['bottom-start', 'top-start', 'bottom-end', 'top-end'],
  }),
];

export class DataViewHeaderToolsViewOptions extends WidgetBase {
  static override styles = styles;

  clickMoreAction = (e: MouseEvent) => {
    e.stopPropagation();
    this.openMoreAction(popupTargetFromElement(e.currentTarget as HTMLElement));
  };

  openMoreAction = (target: PopupTarget) => {
    popViewOptions(target, this.dataViewLogic);
  };

  override render() {
    if (this.view.readonly$.value) {
      return;
    }
    return html` <div
      class="affine-database-toolbar-item more-action"
      @click="${this.clickMoreAction}"
    >
      ${MoreHorizontalIcon()}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'data-view-header-tools-view-options': DataViewHeaderToolsViewOptions;
  }
}
const createSettingMenus = (
  target: PopupTarget,
  dataViewLogic: DataViewUILogicBase,
  reopen: () => void
) => {
  const view = dataViewLogic.view;
  const settingItems: MenuConfig[] = [];
  settingItems.push(
    menu.action({
      name: 'Properties',
      prefix: InfoIcon(),
      postfix: html`<span
          style="font-size: 12px; color: var(--affine-text-secondary-color);"
          >${view.properties$.value.length} shown</span
        >
        ${ArrowRightSmallIcon()}`,
      select: () => {
        popPropertiesSetting(target, {
          view: view,
          onBack: reopen,
        });
      },
    })
  );
  const filterTrait = view.traitGet(filterTraitKey);
  if (filterTrait) {
    const filterCount = filterTrait.filter$.value.conditions.length;
    settingItems.push(
      menu.action({
        name: 'Filter',
        prefix: FilterIcon(),
        postfix: html`<span
            style="font-size: 12px; color: var(--affine-text-secondary-color);"
            >${filterCount === 0
              ? ''
              : filterCount === 1
                ? '1 filter'
                : `${filterCount} filters`}</span
          >
          ${ArrowRightSmallIcon()}`,
        select: () => {
          if (!filterTrait.filter$.value.conditions.length) {
            popCreateFilter(target, {
              vars: view.vars$,
              onBack: reopen,
              onSelect: filter => {
                filterTrait.filterSet({
                  ...(filterTrait.filter$.value ?? emptyFilterGroup),
                  conditions: [...filterTrait.filter$.value.conditions, filter],
                });
                popFilterRoot(target, {
                  filterTrait: filterTrait,
                  onBack: reopen,
                  dataViewLogic: dataViewLogic,
                });
                dataViewLogic.eventTrace('CreateDatabaseFilter', {});
              },
            });
          } else {
            popFilterRoot(target, {
              filterTrait: filterTrait,
              onBack: reopen,
              dataViewLogic: dataViewLogic,
            });
          }
        },
      })
    );
  }
  const sortTrait = view.traitGet(sortTraitKey);
  if (sortTrait) {
    const sortCount = sortTrait.sortList$.value.length;
    settingItems.push(
      menu.action({
        name: 'Sort',
        prefix: SortIcon(),
        postfix: html`<span
            style="font-size: 12px; color: var(--affine-text-secondary-color);"
            >${sortCount === 0
              ? ''
              : sortCount === 1
                ? '1 sort'
                : `${sortCount} sorts`}</span
          >
          ${ArrowRightSmallIcon()}`,
        select: () => {
          const sortList = sortTrait.sortList$.value;
          const sortUtils = createSortUtils(
            sortTrait,
            dataViewLogic.eventTrace
          );
          if (!sortList.length) {
            popCreateSort(target, {
              sortUtils: sortUtils,
              onBack: reopen,
            });
          } else {
            popSortRoot(target, {
              sortUtils: sortUtils,
              title: {
                text: 'Sort',
                onBack: reopen,
              },
            });
          }
        },
      })
    );
  }
  const groupTrait = view.traitGet(groupTraitKey);
  if (groupTrait) {
    settingItems.push(
      menu.action({
        name: 'Group',
        prefix: GroupingIcon(),
        postfix: html`<span
            style="font-size: 12px; color: var(--affine-text-secondary-color);"
            >${groupTrait.property$.value?.name$.value ?? ''}</span
          >
          ${ArrowRightSmallIcon()}`,
        select: () => {
          const groupBy = groupTrait.property$.value;
          if (!groupBy) {
            popSelectGroupByProperty(target, groupTrait, {
              onSelect: () => popGroupSetting(target, groupTrait, reopen),
              onBack: reopen,
            });
          } else {
            popGroupSetting(target, groupTrait, reopen);
          }
        },
      })
    );
  }
  return settingItems;
};

const createChartMenus = (
  _target: PopupTarget,
  view: ChartSingleView,
  reopen: () => void
) => {
  const chartType = view.data$.value?.chartType ?? 'pie';
  const chartTypeLabel = (t: ChartType) =>
    t === 'pie'
      ? 'Pie'
      : t === 'bar'
        ? 'Vertical Bar'
        : t === 'horizontal-bar'
          ? 'Horizontal Bar'
          : t === 'stacked-bar'
            ? 'Stacked Bar'
            : 'Line';
  const items: MenuConfig[] = [];
  items.push(
    menu.subMenu({
      name: 'Chart type',
      postfix: html`<span
        style="font-size: 12px; color: var(--affine-text-secondary-color);"
        >${chartTypeLabel(chartType)}</span
      >`,
      options: {
        items: (
          ['bar', 'horizontal-bar', 'stacked-bar', 'line', 'pie'] as ChartType[]
        ).map(t =>
          menu.action({
            name: chartTypeLabel(t),
            isSelected: chartType === t,
            select: () => {
              view.dataUpdate(() => ({ chartType: t }));
              reopen();
            },
          })
        ),
      },
    })
  );

  // For bar and line charts, show X/Y axis configuration
  if (
    chartType === 'bar' ||
    chartType === 'horizontal-bar' ||
    chartType === 'stacked-bar' ||
    chartType === 'line'
  ) {
    // X axis section
    items.push(
      menu.group({
        name: 'X axis',
        items: [
          menu.subMenu({
            name: 'What to show',
            postfix: html`<span
              style="font-size: 12px; color: var(--affine-text-secondary-color);"
              >${view.properties$.value.find(
                (p: any) => p.id === view.data$.value?.xAxisPropertyId
              )?.name$.value ?? 'Status'}</span
            >`,
            options: {
              items: view.properties$.value.map((prop: any) =>
                menu.action({
                  name: prop.name$.value,
                  isSelected:
                    prop.id ===
                    (view.data$.value?.xAxisPropertyId ||
                      view.data$.value?.categoryPropertyId),
                  select: () => {
                    view.dataUpdate(() => ({ xAxisPropertyId: prop.id }));
                    reopen();
                  },
                })
              ),
            },
          }),
          menu.subMenu({
            name: 'Sort by',
            postfix: html`<span
              style="font-size: 12px; color: var(--affine-text-secondary-color);"
              >${view.data$.value?.xAxisSort || 'Count High → Low'}</span
            >`,
            options: {
              items: [
                'Manual',
                'Status Ascending',
                'Status Descending',
                'Count Low → High',
                'Count High → Low',
              ].map(option =>
                menu.action({
                  name: option,
                  isSelected:
                    (view.data$.value?.xAxisSort || 'Count High → Low') ===
                    option,
                  select: () => {
                    view.dataUpdate(() => ({ xAxisSort: option }));
                    reopen();
                  },
                })
              ),
            },
          }),
          menu.toggleSwitch({
            name: 'Omit zero values',
            on: view.data$.value?.omitZeroValues === true,
            onChange: value => {
              view.dataUpdate(() => ({ omitZeroValues: value }));
            },
          }),
        ],
      })
    );

    // Y axis section
    items.push(
      menu.group({
        name: 'Y axis',
        items: [
          menu.subMenu({
            name: 'What to show',
            postfix: html`<span
              style="font-size: 12px; color: var(--affine-text-secondary-color);"
              >Count</span
            >`,
            options: {
              items: [
                menu.action({
                  name: 'Count',
                  isSelected: true,
                  select: () => {
                    reopen();
                  },
                }),
              ],
            },
          }),
          menu.subMenu({
            name: 'Group by',
            postfix: html`<span
              style="font-size: 12px; color: var(--affine-text-secondary-color);"
              >None</span
            >`,
            options: {
              items: [
                menu.action({
                  name: 'None',
                  isSelected: true,
                  select: () => {
                    reopen();
                  },
                }),
              ],
            },
          }),
          menu.subMenu({
            name: 'Range',
            postfix: html`<span
              style="font-size: 12px; color: var(--affine-text-secondary-color);"
              >Auto</span
            >`,
            options: {
              items: ['Auto', 'Custom'].map(option =>
                menu.action({
                  name: option,
                  isSelected:
                    (view.data$.value?.yAxisRange || 'Auto') === option,
                  select: () => {
                    view.dataUpdate(() => ({ yAxisRange: option }));
                    reopen();
                  },
                })
              ),
            },
          }),
        ],
      })
    );
  } else {
    // For pie charts, show the regular "What to show" menu
    const currentProp = view.properties$.value.find(
      (p: any) => p.id === view.data$.value?.categoryPropertyId
    );
    items.push(
      menu.subMenu({
        name: 'What to show',
        postfix: html`<span
          style="font-size: 12px; color: var(--affine-text-secondary-color);"
          >${currentProp?.name$.value ?? 'None'}</span
        >`,
        options: {
          items: view.properties$.value.map((prop: any) =>
            menu.action({
              name: prop.name$.value,
              isSelected: prop.id === view.data$.value?.categoryPropertyId,
              select: () => {
                view.dataUpdate(() => ({ categoryPropertyId: prop.id }));
                reopen();
              },
            })
          ),
        },
      })
    );
  }

  // Each slice represents menu
  items.push(
    menu.subMenu({
      name: 'Each slice represents',
      postfix: html`<span
        style="font-size: 12px; color: var(--affine-text-secondary-color);"
        >Count</span
      >`,
      options: {
        items: [
          menu.action({
            name: 'Count',
            isSelected: true,
            select: () => {
              // TODO: Implement when sum/average features are added
              reopen();
            },
          }),
        ],
      },
    })
  );

  // Sort by menu
  const sortBy = view.data$.value?.sortBy ?? 'count-high-low';
  const sortLabels: Record<string, string> = {
    manual: 'Manual',
    'status-asc': 'Status Ascending',
    'status-desc': 'Status Descending',
    'count-low-high': 'Count Low → High',
    'count-high-low': 'Count High → Low',
  };

  items.push(
    menu.subMenu({
      name: 'Sort by',
      postfix: html`<span
        style="font-size: 12px; color: var(--affine-text-secondary-color);"
        >${sortLabels[sortBy] || 'Count High → Low'}</span
      >`,
      options: {
        items: Object.entries(sortLabels).map(([key, label]) =>
          menu.action({
            name: label,
            isSelected: sortBy === key,
            select: () => {
              view.dataUpdate(() => ({ sortBy: key }));
              reopen();
            },
          })
        ),
      },
    })
  );

  // Color menu
  const colorScheme = view.data$.value?.colorScheme ?? 'auto';
  const colorSchemes = [
    { id: 'auto', name: 'Auto' },
    { id: 'colorful', name: 'Colorful' },
    { id: 'colorless', name: 'Colorless' },
    { id: 'blue', name: 'Blue' },
    { id: 'yellow', name: 'Yellow' },
    { id: 'green', name: 'Green' },
    { id: 'purple', name: 'Purple' },
    { id: 'teal', name: 'Teal' },
    { id: 'orange', name: 'Orange' },
    { id: 'pink', name: 'Pink' },
    { id: 'red', name: 'Red' },
  ];

  items.push(
    menu.subMenu({
      name: 'Color',
      postfix: html`<span
        style="font-size: 12px; color: var(--affine-text-secondary-color);"
        >${colorSchemes.find(c => c.id === colorScheme)?.name || 'Auto'}</span
      >`,
      options: {
        items: colorSchemes.map(scheme =>
          menu.action({
            name: scheme.name,
            isSelected: colorScheme === scheme.id,
            select: () => {
              view.dataUpdate(() => ({ colorScheme: scheme.id }));
              reopen();
            },
          })
        ),
      },
    })
  );

  // More style options menu
  items.push(
    menu.subMenu({
      name: 'More style options',
      options: {
        items: [
          menu.subMenu({
            name: 'Height',
            postfix: html`<span
              style="font-size: 12px; color: var(--affine-text-secondary-color);"
              >${view.data$.value?.height || 'Medium'}</span
            >`,
            options: {
              items: ['Small', 'Medium', 'Large'].map(size =>
                menu.action({
                  name: size,
                  isSelected: (view.data$.value?.height || 'Medium') === size,
                  select: () => {
                    view.dataUpdate(() => ({ height: size }));
                    reopen();
                  },
                })
              ),
            },
          }),
          menu.toggleSwitch({
            name: 'Show value in center',
            on: view.data$.value?.showValueInCenter !== false,
            onChange: value => {
              view.dataUpdate(() => ({ showValueInCenter: value }));
            },
          }),
          menu.toggleSwitch({
            name: 'Legend',
            on: view.data$.value?.showLegend !== false,
            onChange: value => {
              view.dataUpdate(() => ({ showLegend: value }));
            },
          }),
          menu.subMenu({
            name: 'Data labels',
            postfix: html`<span
              style="font-size: 12px; color: var(--affine-text-secondary-color);"
              >${view.data$.value?.dataLabels || 'Value (%)'}</span
            >`,
            options: {
              items: ['None', 'Value', 'Value (%)'].map(option =>
                menu.action({
                  name: option,
                  isSelected:
                    (view.data$.value?.dataLabels || 'Value (%)') === option,
                  select: () => {
                    view.dataUpdate(() => ({ dataLabels: option }));
                    reopen();
                  },
                })
              ),
            },
          }),
          menu.toggleSwitch({
            name: 'Caption',
            on: view.data$.value?.showCaption === true,
            onChange: value => {
              view.dataUpdate(() => ({ showCaption: value }));
            },
          }),
        ],
      },
    })
  );

  return items;
};

export const popViewOptions = (
  target: PopupTarget,
  dataViewLogic: DataViewUILogicBase,
  onClose?: () => void
) => {
  const view = dataViewLogic.view;
  const reopen = () => {
    popViewOptions(target, dataViewLogic);
  };
  const items: MenuConfig[] = [];
  items.push(
    menu.input({
      initialValue: view.name$.value,
      placeholder: 'View name',
      onChange: text => {
        view.nameSet(text);
      },
    })
  );
  items.push(
    menu.group({
      items: [
        menu.action({
          name: 'Layout',
          postfix: html`<span
              style="font-size: 12px; color: var(--affine-text-secondary-color); text-transform: capitalize;"
              >${view.type}</span
            >
            ${ArrowRightSmallIcon()}`,
          select: () => {
            const viewTypes = view.manager.viewMetas.map<MenuConfig>(meta => {
              return menu => {
                if (!menu.search(meta.model.defaultName)) {
                  return;
                }
                const isSelected =
                  meta.type === view.manager.currentView$.value?.type;
                const iconStyle = styleMap({
                  fontSize: '24px',
                  color: isSelected
                    ? 'var(--affine-text-emphasis-color)'
                    : 'var(--affine-icon-secondary)',
                });
                const textStyle = styleMap({
                  fontSize: '14px',
                  lineHeight: '22px',
                  color: isSelected
                    ? 'var(--affine-text-emphasis-color)'
                    : 'var(--affine-text-secondary-color)',
                });
                const data: MenuButtonData = {
                  content: () => html`
                    <div
                      style="color:var(--affine-text-emphasis-color);width:100%;display: flex;flex-direction: column;align-items: center;justify-content: center;padding: 6px 16px;white-space: nowrap"
                    >
                      <div style="${iconStyle}">
                        ${renderUniLit(meta.renderer.icon)}
                      </div>
                      <div style="${textStyle}">${meta.model.defaultName}</div>
                    </div>
                  `,
                  select: () => {
                    const id = view.manager.currentViewId$.value;
                    if (!id) {
                      return;
                    }
                    // Only change view type if it's different from current
                    if (meta.type !== view.type) {
                      view.manager.viewChangeType(id, meta.type);
                      dataViewLogic.clearSelection();
                    }
                  },
                  class: {},
                };
                const containerStyle = styleMap({
                  flex: '1',
                });
                return html` <affine-menu-button
                  style="${containerStyle}"
                  .data="${data}"
                  .menu="${menu}"
                ></affine-menu-button>`;
              };
            });
            popMenu(target, {
              options: {
                title: {
                  onBack: reopen,
                  text: 'Layout',
                },
                items: [
                  menu => {
                    const result = menu.renderItems(viewTypes);
                    if (result.length) {
                      return html` <div style="display: flex">${result}</div>`;
                    }
                    return html``;
                  },
                  // menu.toggleSwitch({
                  //   name: 'Show block icon',
                  //   on: true,
                  //   onChange: value => {
                  //     console.log(value);
                  //   },
                  // }),
                  // menu.toggleSwitch({
                  //   name: 'Show Vertical lines',
                  //   on: true,
                  //   onChange: value => {
                  //     console.log(value);
                  //   },
                  // }),
                ],
              },
              middleware: createViewOptionsMiddleware(),
            });
          },
          prefix: LayoutIcon(),
        }),
      ],
    })
  );

  if (view.type === 'chart') {
    items.push(
      menu.group({
        items: createChartMenus(
          target,
          view as unknown as ChartSingleView,
          reopen
        ),
      })
    );
  }

  items.push(
    menu.group({
      items: createSettingMenus(target, dataViewLogic, reopen),
    })
  );
  items.push(
    menu.group({
      items: [
        menu.action({
          name: 'Duplicate',
          prefix: DuplicateIcon(),
          select: () => {
            view.duplicate();
          },
        }),
        menu.action({
          name: 'Delete',
          prefix: DeleteIcon(),
          select: () => {
            view.delete();
          },
          class: { 'delete-item': true },
        }),
      ],
    })
  );
  popMenu(target, {
    options: {
      title: {
        text: 'View settings',
      },
      items,
      onClose: onClose,
    },
    middleware: createViewOptionsMiddleware(),
  });
};
