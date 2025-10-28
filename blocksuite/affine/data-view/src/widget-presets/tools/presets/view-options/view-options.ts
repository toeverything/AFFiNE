import {
  type Menu,
  menu,
  type MenuButtonData,
  type MenuConfig,
  type MenuOptions,
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
import { css, html, nothing } from 'lit';
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

type ChartType = 'pie' | 'bar' | 'horizontal-bar' | 'stacked-bar' | 'line';
type ChartSingleView = any;

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
    padding: 16,
    crossAxis: false,
  }),
  autoPlacement({
    alignment: 'start',
    allowedPlacements: ['bottom-start', 'top-start', 'bottom-end', 'top-end'],
  }),
];

const createDropdownMiddleware = (): Middleware[] => [
  offset(8),
  shift({
    padding: 16,
    crossAxis: false,
  }),
  autoPlacement({
    alignment: 'start',
    allowedPlacements: ['left-start', 'left-end', 'bottom-start', 'bottom-end'],
  }),
];

const refreshMenuInstance = (menuInstance: Menu) => {
  menuInstance.closeSubMenu();
  const element = menuInstance.menuElement as {
    requestUpdate?: () => void;
  };
  element.requestUpdate?.();
};

const clickSubMenu = (config: {
  name: string;
  buildOptions: (refreshParent: () => void) => MenuOptions;
  postfix?: ReturnType<typeof html>;
  prefix?: ReturnType<typeof html>;
  label?: () => ReturnType<typeof html>;
  hide?: () => boolean;
}) => {
  return (menuInstance: Menu, index: number) => {
    if (config.hide?.() || !menuInstance.search(config.name)) {
      return;
    }
    const refreshParent = () => refreshMenuInstance(menuInstance);
    const options = config.buildOptions(refreshParent);
    const renderer: MenuConfig = menu.action({
      name: config.name,
      prefix: config.prefix,
      label: config.label,
      postfix: html`${config.postfix ?? nothing}${ArrowRightSmallIcon()}`,
      select: ele => {
        const target = popupTargetFromElement(ele);
        const handler = popMenu(target, {
          options: {
            ...options,
            onClose: () => {
              options.onClose?.();
              refreshParent();
            },
          },
          middleware: createDropdownMiddleware(),
          container: document.body,
        });
        handler.menu.menuElement.style.zIndex = '2000';
        return false;
      },
    });
    return renderer(menuInstance, index);
  };
};

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
  view: ChartSingleView,
  refreshParentMenu: () => void
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
    clickSubMenu({
      name: 'Chart type',
      postfix: html`<span
        style="font-size: 12px; color: var(--affine-text-secondary-color);"
        >${chartTypeLabel(chartType)}</span
      >`,
      buildOptions: () => ({
        items: (
          ['pie', 'bar', 'horizontal-bar', 'stacked-bar', 'line'] as ChartType[]
        ).map(t =>
          menu.action({
            name: chartTypeLabel(t),
            isSelected: chartType === t,
            select: () => {
              if (chartType !== t) {
                view.dataUpdate(() => ({ chartType: t }));
                // Refresh the parent menu to show the correct options for the new chart type
                refreshParentMenu();
              }
            },
          })
        ),
      }),
    })
  );

  // For bar and line charts, show X/Y axis configuration
  if (chartType === 'pie') {
    // For pie charts, show the regular "What to show" menu
    const currentProp = view.properties$.value.find(
      (p: any) => p.id === view.data$.value?.categoryPropertyId
    );
    items.push(
      clickSubMenu({
        name: 'What to show',
        postfix: html`<span
          style="font-size: 12px; color: var(--affine-text-secondary-color);"
          >${currentProp?.name$.value ?? 'None'}</span
        >`,
        buildOptions: refresh => ({
          items: view.properties$.value.map((prop: any) =>
            menu.action({
              name: prop.name$.value,
              isSelected: prop.id === view.data$.value?.categoryPropertyId,
              select: () => {
                view.dataUpdate(() => ({ categoryPropertyId: prop.id }));
                refresh();
              },
            })
          ),
        }),
      })
    );
  }

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
    clickSubMenu({
      name: 'Sort by',
      postfix: html`<span
        style="font-size: 12px; color: var(--affine-text-secondary-color);"
        >${sortLabels[sortBy] || 'Count High → Low'}</span
      >`,
      buildOptions: refresh => ({
        items: Object.entries(sortLabels).map(([key, label]) =>
          menu.action({
            name: label,
            isSelected: sortBy === key,
            select: () => {
              view.dataUpdate(() => ({ sortBy: key }));
              refresh();
            },
          })
        ),
      }),
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
    clickSubMenu({
      name: 'Color',
      postfix: html`<span
        style="font-size: 12px; color: var(--affine-text-secondary-color);"
        >${colorSchemes.find(c => c.id === colorScheme)?.name || 'Auto'}</span
      >`,
      buildOptions: refresh => ({
        items: colorSchemes.map(scheme =>
          menu.action({
            name: scheme.name,
            isSelected: colorScheme === scheme.id,
            select: () => {
              view.dataUpdate(() => ({ colorScheme: scheme.id }));
              refresh();
            },
          })
        ),
      }),
    })
  );

  const heightMenuItem = clickSubMenu({
    name: 'Height',
    postfix: html`<span
      style="font-size: 12px; color: var(--affine-text-secondary-color);"
      >${view.data$.value?.height || 'Medium'}</span
    >`,
    buildOptions: refresh => ({
      items: ['Small', 'Medium', 'Large'].map(size =>
        menu.action({
          name: size,
          isSelected: (view.data$.value?.height || 'Medium') === size,
          select: () => {
            view.dataUpdate(() => ({ height: size }));
            refresh();
          },
        })
      ),
    }),
  });

  const captionInputItem: MenuConfig = _menu => {
    const showCaption = view.data$.value?.showCaption === true;
    const captionText = view.data$.value?.captionText ?? '';
    const stopPropagation = (event: Event) => event.stopPropagation();
    const onInput = (event: Event) => {
      event.stopPropagation();
      const next = (event.target as HTMLTextAreaElement).value;
      view.dataUpdate(() => ({ captionText: next }));
    };
    return html`<div style="padding: 0 16px 8px 16px; width: 240px;">
      <textarea
        .value=${captionText}
        ?disabled=${!showCaption}
        placeholder="Caption"
        style="width: 100%; min-height: 56px; resize: none; border-radius: 6px; border: 1px solid var(--affine-border-color); background: transparent; color: var(--affine-text-primary-color); padding: 6px 8px; font-size: 14px; line-height: 20px; box-sizing: border-box;"
        @click=${stopPropagation}
        @mousedown=${stopPropagation}
        @mouseup=${stopPropagation}
        @keydown=${stopPropagation}
        @keyup=${stopPropagation}
        @input=${onInput}
      ></textarea>
    </div>`;
  };

  const gridLineOptions = ['none', 'horizontal', 'vertical', 'both'] as const;
  const gridLineLabels: Record<(typeof gridLineOptions)[number], string> = {
    none: 'None',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    both: 'Both',
  };
  const axisNameOptions = ['none', 'x', 'y', 'both'] as const;
  const axisNameLabels: Record<(typeof axisNameOptions)[number], string> = {
    none: 'None',
    x: 'X axis',
    y: 'Y axis',
    both: 'Both axes',
  };

  const buildMoreStyleItems = (refresh: () => void): MenuConfig[] => {
    if (chartType === 'line') {
      return [
        heightMenuItem,
        clickSubMenu({
          name: 'Grid line',
          postfix: html`<span
            style="font-size: 12px; color: var(--affine-text-secondary-color);"
            >${gridLineLabels[
              (view.data$.value?.gridLine ??
                'horizontal') as (typeof gridLineOptions)[number]
            ]}</span
          >`,
          buildOptions: innerRefresh => ({
            items: gridLineOptions.map(mode =>
              menu.action({
                name: gridLineLabels[mode],
                isSelected:
                  (view.data$.value?.gridLine ?? 'horizontal') === mode,
                select: () => {
                  view.dataUpdate(() => ({ gridLine: mode }));
                  innerRefresh();
                  refresh();
                },
              })
            ),
          }),
        }),
        clickSubMenu({
          name: 'Axis name',
          postfix: html`<span
            style="font-size: 12px; color: var(--affine-text-secondary-color);"
            >${axisNameLabels[
              (view.data$.value?.axisNameMode ??
                'none') as (typeof axisNameOptions)[number]
            ]}</span
          >`,
          buildOptions: innerRefresh => ({
            items: axisNameOptions.map(mode =>
              menu.action({
                name: axisNameLabels[mode],
                isSelected: (view.data$.value?.axisNameMode ?? 'none') === mode,
                select: () => {
                  view.dataUpdate(() => ({ axisNameMode: mode }));
                  innerRefresh();
                  refresh();
                },
              })
            ),
          }),
        }),
        menu.toggleSwitch({
          name: 'Smooth line',
          on: view.data$.value?.smoothLine !== false,
          onChange: value => {
            view.dataUpdate(() => ({ smoothLine: value }));
            refresh();
          },
        }),
        menu.toggleSwitch({
          name: 'Gradient area',
          on: view.data$.value?.gradientArea !== false,
          onChange: value => {
            view.dataUpdate(() => ({ gradientArea: value }));
            refresh();
          },
        }),
        menu.toggleSwitch({
          name: 'Legend',
          on: view.data$.value?.showLegend !== false,
          onChange: value => {
            view.dataUpdate(() => ({ showLegend: value }));
            refresh();
          },
        }),
        menu.toggleSwitch({
          name: 'Data labels',
          on: view.data$.value?.showDataLabels !== false,
          onChange: value => {
            view.dataUpdate(() => ({ showDataLabels: value }));
            refresh();
          },
        }),
        menu.toggleSwitch({
          name: 'Caption',
          on: view.data$.value?.showCaption === true,
          onChange: value => {
            view.dataUpdate(() => ({ showCaption: value }));
            refresh();
          },
        }),
        captionInputItem,
      ];
    }

    const items: MenuConfig[] = [heightMenuItem];
    if (chartType === 'pie') {
      items.push(
        menu.toggleSwitch({
          name: 'Show value in center',
          on: view.data$.value?.showValueInCenter !== false,
          onChange: value => {
            view.dataUpdate(() => ({ showValueInCenter: value }));
            refresh();
          },
        })
      );
    }
    items.push(
      menu.toggleSwitch({
        name: 'Legend',
        on: view.data$.value?.showLegend !== false,
        onChange: value => {
          view.dataUpdate(() => ({ showLegend: value }));
          refresh();
        },
      })
    );
    items.push(
      clickSubMenu({
        name: 'Data labels',
        postfix: html`<span
          style="font-size: 12px; color: var(--affine-text-secondary-color);"
          >${view.data$.value?.dataLabels || 'Value (%)'}</span
        >`,
        buildOptions: innerRefresh => ({
          items: ['None', 'Value', 'Value (%)'].map(option =>
            menu.action({
              name: option,
              isSelected:
                (view.data$.value?.dataLabels || 'Value (%)') === option,
              select: () => {
                view.dataUpdate(() => ({ dataLabels: option }));
                innerRefresh();
                refresh();
              },
            })
          ),
        }),
      })
    );
    items.push(
      menu.toggleSwitch({
        name: 'Caption',
        on: view.data$.value?.showCaption === true,
        onChange: value => {
          view.dataUpdate(() => ({ showCaption: value }));
          refresh();
        },
      })
    );
    items.push(captionInputItem);
    return items;
  };

  // More style options menu
  items.push(
    clickSubMenu({
      name: 'More style options',
      buildOptions: refresh => ({
        items: buildMoreStyleItems(refresh),
      }),
    })
  );

  return items;
};

const renderChartMenuGroup = (view: ChartSingleView): MenuConfig => {
  return (menuInstance: Menu) => {
    const chartItems = createChartMenus(view, () =>
      refreshMenuInstance(menuInstance)
    );
    return html`${menuInstance.renderItems(chartItems)}`;
  };
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
        items: [renderChartMenuGroup(view as ChartSingleView)],
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
