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
import { autoPlacement, offset, shift } from '@floating-ui/dom';
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
  reopen: () => void,
  closeMenu: () => void
) => {
  const view = dataViewLogic.view;
  const settingItems: MenuConfig[] = [];
  settingItems.push(
    menu.action({
      name: 'Properties',
      prefix: InfoIcon(),
      closeOnSelect: false,
      postfix: html` <div style="font-size: 14px;">
          ${view.properties$.value.length} shown
        </div>
        ${ArrowRightSmallIcon()}`,
      select: () => {
        popPropertiesSetting(
          target,
          {
            view: view,
            onBack: reopen,
            onClose: closeMenu,
          },
          [
            autoPlacement({ allowedPlacements: ['bottom-start', 'top-start'] }),
            offset({ mainAxis: 15, crossAxis: -162 }),
            shift({ crossAxis: true }),
          ]
        );
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
        closeOnSelect: false,
        postfix: html` <div style="font-size: 14px;">
            ${filterCount === 0
              ? ''
              : filterCount === 1
                ? '1 filter'
                : `${filterCount} filters`}
          </div>
          ${ArrowRightSmallIcon()}`,
        select: () => {
          if (!filterTrait.filter$.value.conditions.length) {
            popCreateFilter(
              target,
              {
                vars: view.vars$,
                onBack: reopen,
                onClose: closeMenu,
                onSelect: filter => {
                  filterTrait.filterSet({
                    ...(filterTrait.filter$.value ?? emptyFilterGroup),
                    conditions: [
                      ...filterTrait.filter$.value.conditions,
                      filter,
                    ],
                  });
                  popFilterRoot(
                    target,
                    {
                      filterTrait: filterTrait,
                      onBack: reopen,
                      onClose: closeMenu,
                      dataViewLogic: dataViewLogic,
                    },
                    [
                      autoPlacement({
                        allowedPlacements: ['bottom-start', 'top-start'],
                      }),
                      offset({ mainAxis: 15, crossAxis: -162 }),
                      shift({ crossAxis: true }),
                    ]
                  );
                  dataViewLogic.eventTrace('CreateDatabaseFilter', {});
                },
              },
              {
                middleware: [
                  autoPlacement({
                    allowedPlacements: ['bottom-start', 'top-start'],
                  }),
                  offset({ mainAxis: 15, crossAxis: -162 }),
                  shift({ crossAxis: true }),
                ],
              }
            );
          } else {
            popFilterRoot(
              target,
              {
                filterTrait: filterTrait,
                onBack: reopen,
                onClose: closeMenu,
                dataViewLogic: dataViewLogic,
              },
              [
                autoPlacement({
                  allowedPlacements: ['bottom-start', 'top-start'],
                }),
                offset({ mainAxis: 15, crossAxis: -162 }),
                shift({ crossAxis: true }),
              ]
            );
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
        closeOnSelect: false,
        postfix: html` <div style="font-size: 14px;">
            ${sortCount === 0
              ? ''
              : sortCount === 1
                ? '1 sort'
                : `${sortCount} sorts`}
          </div>
          ${ArrowRightSmallIcon()}`,
        select: () => {
          const sortList = sortTrait.sortList$.value;
          const sortUtils = createSortUtils(
            sortTrait,
            dataViewLogic.eventTrace
          );
          if (!sortList.length) {
            popCreateSort(
              target,
              {
                sortUtils: sortUtils,
                onBack: reopen,
                onClose: closeMenu,
              },
              {
                middleware: [
                  autoPlacement({
                    allowedPlacements: ['bottom-start', 'top-start'],
                  }),
                  offset({ mainAxis: 15, crossAxis: -162 }),
                  shift({ crossAxis: true }),
                ],
              }
            );
          } else {
            popSortRoot(
              target,
              {
                sortUtils: sortUtils,
                title: {
                  text: 'Sort',
                  onBack: reopen,
                  onClose: closeMenu,
                },
              },
              [
                autoPlacement({
                  allowedPlacements: ['bottom-start', 'top-start'],
                }),
                offset({ mainAxis: 15, crossAxis: -162 }),
                shift({ crossAxis: true }),
              ]
            );
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
        closeOnSelect: false,
        postfix: html` <div style="font-size: 14px;">
            ${groupTrait.property$.value?.name$.value ?? ''}
          </div>
          ${ArrowRightSmallIcon()}`,
        select: () => {
          const groupBy = groupTrait.property$.value;
          if (!groupBy) {
            popSelectGroupByProperty(
              target,
              groupTrait,
              {
                onSelect: () =>
                  popGroupSetting(target, groupTrait, reopen, closeMenu, [
                    autoPlacement({
                      allowedPlacements: ['bottom-start', 'top-start'],
                    }),
                    offset({ mainAxis: 15, crossAxis: -162 }),
                    shift({ crossAxis: true }),
                  ]),
                onBack: reopen,
                onClose: closeMenu,
              },
              [
                autoPlacement({
                  allowedPlacements: ['bottom-start', 'top-start'],
                }),
                offset({ mainAxis: 15, crossAxis: -162 }),
                shift({ crossAxis: true }),
              ]
            );
          } else {
            popGroupSetting(target, groupTrait, reopen, closeMenu, [
              autoPlacement({
                allowedPlacements: ['bottom-start', 'top-start'],
              }),
              offset({ mainAxis: 15, crossAxis: -162 }),
              shift({ crossAxis: true }),
            ]);
          }
        },
      })
    );
  }
  return settingItems;
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
          postfix: html` <div
              style="font-size: 14px;text-transform: capitalize;"
            >
              ${view.type}
            </div>
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
                    view.manager.viewChangeType(id, meta.type);
                    dataViewLogic.clearSelection();
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
            const subHandler = popMenu(target, {
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
              middleware: [
                autoPlacement({
                  allowedPlacements: ['bottom-start', 'top-start'],
                }),
                offset({ mainAxis: 15, crossAxis: -162 }),
                shift({ crossAxis: true }),
              ],
            });
            subHandler.menu.menuElement.style.minHeight = '550px';
          },
          prefix: LayoutIcon(),
        }),
      ],
    })
  );

  items.push(
    menu.group({
      items: createSettingMenus(target, dataViewLogic, reopen, () =>
        handler.close()
      ),
    })
  );
  items.push(
    menu.group({
      items: [
        menu.action({
          name: 'Duplicate',
          prefix: DuplicateIcon(),
          closeOnSelect: false,
          select: () => {
            view.duplicate();
          },
        }),
        menu.action({
          name: 'Delete',
          prefix: DeleteIcon(),
          closeOnSelect: false,
          select: () => {
            view.delete();
          },
          class: { 'delete-item': true },
        }),
      ],
    })
  );
  let handler: ReturnType<typeof popMenu>;
  handler = popMenu(target, {
    options: {
      title: {
        text: 'View settings',
        onClose: () => handler.close(),
      },
      items,
      onClose: onClose,
    },
    middleware: [
      autoPlacement({ allowedPlacements: ['bottom-start'] }),
      offset({ mainAxis: 15, crossAxis: -162 }),
      shift({ crossAxis: true }),
    ],
  });
  handler.menu.menuElement.style.minHeight = '550px';
  return handler;
};
