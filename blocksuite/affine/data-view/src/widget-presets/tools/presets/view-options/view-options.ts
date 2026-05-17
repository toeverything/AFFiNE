import {
  type Menu,
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
  PlusIcon,
  SortIcon,
} from '@blocksuite/icons/lit';
import { autoPlacement, offset, shift } from '@floating-ui/dom';
import { signal } from '@preact/signals-core';
import { css, html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { filterTraitKey } from '../../../../core/filter/trait.js';
import {
  buildGroupSelectItems,
  buildGroupSettingItems,
} from '../../../../core/group-by/setting.js';
import { groupTraitKey } from '../../../../core/group-by/trait.js';
import {
  type DataViewUILogicBase,
  popCreateFilter,
  renderUniLit,
} from '../../../../core/index.js';
import { popCreateSort } from '../../../../core/sort/add-sort.js';
import { sortTraitKey } from '../../../../core/sort/manager.js';
import { createSortUtils } from '../../../../core/sort/utils.js';
import { WidgetBase } from '../../../../core/widget/widget-base.js';

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
type Page =
  | 'main'
  | 'properties'
  | 'filter'
  | 'sort'
  | 'group'
  | 'group-select'
  | 'custom';

const pageTitles: Record<Exclude<Page, 'custom'>, string> = {
  main: 'View settings',
  properties: 'Properties',
  filter: 'Filter',
  sort: 'Sort',
  group: 'Group',
  'group-select': 'Group by',
};

export const popViewOptions = (
  target: PopupTarget,
  dataViewLogic: DataViewUILogicBase,
  onClose?: () => void
) => {
  const view = dataViewLogic.view;

  const currentPage = signal<Page>('main');
  const pageStack: Page[] = ['main'];

  let menuHandler!: ReturnType<typeof popMenu>;
  let mainPageHeight: number | null = null;
  let customPageTitle = '';
  let customPageItems: () => MenuConfig[] = () => [];

  const isDesktopMenu = () =>
    menuHandler.menu.menuElement.tagName.toLowerCase() === 'affine-menu';

  const navigate = (page: Page) => {
    if (!isDesktopMenu()) {
      pageStack.push(page);
      currentPage.value = page;
      return;
    }
    if (mainPageHeight === null) {
      mainPageHeight =
        menuHandler.menu.menuElement.getBoundingClientRect().height;
    }
    menuHandler.menu.menuElement.style.height = `${mainPageHeight}px`;
    pageStack.push(page);
    currentPage.value = page;
  };

  const goBack = () => {
    if (pageStack.length > 1) {
      pageStack.pop();
      const dest = pageStack[pageStack.length - 1] ?? 'main';
      currentPage.value = dest;
      if (dest === 'main') {
        menuHandler.menu.menuElement.style.height = '';
      }
    }
  };

  const navigateToCustomPage = (
    title: string,
    getItems: () => MenuConfig[]
  ) => {
    customPageTitle = title;
    customPageItems = getItems;
    navigate('custom');
  };

  const titleConfig = {
    get text() {
      if (currentPage.value === 'custom') return customPageTitle;
      return (
        pageTitles[currentPage.value as Exclude<Page, 'custom'>] ??
        'View settings'
      );
    },
    get onBack(): ((menu: Menu) => false) | undefined {
      return currentPage.value !== 'main'
        ? (_: Menu) => {
            goBack();
            return false;
          }
        : undefined;
    },
    get postfix() {
      if (currentPage.value !== 'properties') return undefined;
      const items = view.propertiesRaw$.value;
      const isAllShowed = items.every(p => !p.hide$.value);
      const clickChangeAll = () => {
        items.forEach(p => {
          if (p.hideCanSet) p.hideSet(isAllShowed);
        });
      };
      return () =>
        html`<div
          class="properties-group-op"
          style="padding:4px 8px;font-size:12px;line-height:20px;font-weight:500;border-radius:4px;cursor:pointer;color:var(--affine-primary-color);"
          @click="${clickChangeAll}"
        >
          ${isAllShowed ? 'Hide All' : 'Show All'}
        </div>`;
    },
    get onClose() {
      return () => menuHandler?.menu.close();
    },
  };

  const getPropertiesPageItems = (): MenuConfig[] => [
    menu.group({
      items: [
        () =>
          html`<data-view-properties-setting
            .view="${view}"
          ></data-view-properties-setting>`,
      ],
    }),
  ];

  const getFilterPageItems = (): MenuConfig[] => {
    const filterTrait = view.traitGet(filterTraitKey);
    if (!filterTrait) return getMainPageItems();
    return [
      menu.group({
        items: [
          () =>
            html`<filter-root-view
              .onBack="${goBack}"
              .vars="${view.vars$}"
              .filterGroup="${filterTrait.filter$}"
              .onChange="${filterTrait.filterSet}"
            ></filter-root-view>`,
        ],
      }),
      menu.group({
        items: [
          menu.action({
            name: 'Add',
            prefix: PlusIcon(),
            select: ele => {
              const value = filterTrait.filter$.value;
              popCreateFilter(popupTargetFromElement(ele), {
                vars: view.vars$,
                onSelect: filter => {
                  filterTrait.filterSet({
                    ...value,
                    conditions: [...value.conditions, filter],
                  });
                  dataViewLogic.eventTrace('CreateDatabaseFilter', {});
                },
              });
              return false;
            },
          }),
        ],
      }),
    ];
  };

  const getSortPageItems = (): MenuConfig[] => {
    const sortTrait = view.traitGet(sortTraitKey);
    if (!sortTrait) return getMainPageItems();
    const sortUtils = createSortUtils(sortTrait, dataViewLogic.eventTrace);
    return [
      () => html`<sort-root-view .sortUtils="${sortUtils}"></sort-root-view>`,
      menu.action({
        name: 'Add sort',
        prefix: PlusIcon(),
        select: ele => {
          popCreateSort(popupTargetFromElement(ele), { sortUtils });
          return false;
        },
      }),
      menu.action({
        name: 'Delete',
        class: { 'delete-item': true },
        prefix: DeleteIcon(),
        select: () => {
          sortUtils.removeAll();
        },
      }),
    ];
  };

  const getGroupPageItems = (): MenuConfig[] => {
    const groupTrait = view.traitGet(groupTraitKey);
    if (!groupTrait) return getMainPageItems();
    const gProp = groupTrait.property$.value;
    if (!gProp) return [];
    return buildGroupSettingItems(
      groupTrait,
      () => navigate('group-select'),
      () => navigate('main')
    );
  };

  const getGroupSelectPageItems = (): MenuConfig[] => {
    const groupTrait = view.traitGet(groupTraitKey);
    if (!groupTrait) return getMainPageItems();
    return buildGroupSelectItems(groupTrait, id => {
      if (id) {
        if (pageStack.at(-1) === 'group-select') {
          pageStack[pageStack.length - 1] = 'group';
        } else {
          pageStack.push('group');
        }
        currentPage.value = 'group';
      } else {
        while (pageStack.length > 1) pageStack.pop();
        currentPage.value = 'main';
      }
    });
  };

  const getMainPageItems = (): MenuConfig[] => {
    const items: MenuConfig[] = [];

    items.push(
      menu.input({
        initialValue: view.name$.value,
        placeholder: 'View name',
        disableAutoFocus: true,
        onChange: text => {
          view.nameSet(text);
        },
      })
    );

    items.push(
      menu.group({
        items: [
          menuObj => {
            const viewTypeItems = menuObj.renderItems(
              view.manager.viewMetas.map<MenuConfig>(meta => {
                return menuObj => {
                  if (!menuObj.search(meta.model.defaultName)) {
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
                  const buttonData: MenuButtonData = {
                    content: () => html`
                      <div
                        style="width:100%;min-width:0;display: flex;flex-direction: column;align-items: center;justify-content: center;padding: 6px 4px;white-space: nowrap;box-sizing:border-box;"
                      >
                        <div style="${iconStyle}">
                          ${renderUniLit(meta.renderer.icon)}
                        </div>
                        <div style="${textStyle}">
                          ${meta.model.defaultName}
                        </div>
                      </div>
                    `,
                    select: () => {
                      const id = view.manager.currentViewId$.value;
                      if (!id || meta.type === view.type) {
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
                  return html`<affine-menu-button
                    style="${containerStyle}"
                    .data="${buttonData}"
                    .menu="${menuObj}"
                  ></affine-menu-button>`;
                };
              })
            );
            if (!viewTypeItems.length) {
              return html``;
            }
            return html`
              <div
                style="display:flex;align-items:center;gap:8px;padding:0 2px;"
              >
                <div
                  style="display:flex;align-items:center;color:var(--affine-icon-color);"
                >
                  ${LayoutIcon()}
                </div>
                <div
                  style="font-size:14px;line-height:22px;color:var(--affine-text-secondary-color);"
                >
                  Layout
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:8px;">
                ${viewTypeItems}
              </div>
            `;
          },
        ],
      })
    );

    const settingItems: MenuConfig[] = [];

    settingItems.push(
      menu.action({
        name: 'Properties',
        prefix: InfoIcon(),
        closeOnSelect: false,
        postfix: html`
          <div style="font-size: 14px;">
            ${view.properties$.value.length} shown
          </div>
          ${ArrowRightSmallIcon()}
        `,
        select: () => {
          navigate('properties');
          return false;
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
          postfix: html`
            <div style="font-size: 14px;">
              ${filterCount === 0
                ? ''
                : filterCount === 1
                  ? '1 active'
                  : `${filterCount} active`}
            </div>
            ${ArrowRightSmallIcon()}
          `,
          select: () => {
            navigate('filter');
            return false;
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
          postfix: html`
            <div style="font-size: 14px;">
              ${sortCount === 0
                ? ''
                : sortCount === 1
                  ? '1 active'
                  : `${sortCount} active`}
            </div>
            ${ArrowRightSmallIcon()}
          `,
          select: () => {
            navigate('sort');
            return false;
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
          postfix: html`
            <div style="font-size: 14px;">
              ${groupTrait.property$.value?.name$.value ?? ''}
            </div>
            ${ArrowRightSmallIcon()}
          `,
          select: () => {
            const hasGroup = !!groupTrait.property$.value;
            navigate(hasGroup ? 'group' : 'group-select');
            return false;
          },
        })
      );
    }

    items.push(menu.group({ items: settingItems }));

    const viewSpecificItems =
      (
        dataViewLogic as DataViewUILogicBase & {
          getViewOptionsSettingItems?: (
            navigateToSubPage?: (
              title: string,
              getItems: () => MenuConfig[]
            ) => void,
            goBack?: () => void
          ) => MenuConfig[];
        }
      ).getViewOptionsSettingItems?.(navigateToCustomPage, goBack) ?? [];

    if (viewSpecificItems.length) {
      items.push(menu.group({ items: viewSpecificItems }));
    }

    items.push(
      menu.group({
        items: [
          menu.action({
            name: 'Duplicate view',
            prefix: DuplicateIcon(),
            closeOnSelect: false,
            select: () => {
              view.duplicate();
            },
          }),
          menu.action({
            name: 'Delete view',
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

    return items;
  };

  const getPageItems = (): MenuConfig[] => {
    switch (currentPage.value) {
      case 'properties':
        return getPropertiesPageItems();
      case 'filter':
        return getFilterPageItems();
      case 'sort':
        return getSortPageItems();
      case 'group':
        return getGroupPageItems();
      case 'group-select':
        return getGroupSelectPageItems();
      case 'custom':
        return customPageItems();
      default:
        return getMainPageItems();
    }
  };

  menuHandler = popMenu(target, {
    options: {
      title: titleConfig,
      items: [menu.dynamic(getPageItems)],
      onClose,
    },
    middleware: [
      autoPlacement({ allowedPlacements: ['bottom-start'] }),
      offset({ mainAxis: 15, crossAxis: -162 }),
      shift({ crossAxis: true }),
    ],
  });
  if (isDesktopMenu()) {
    menuHandler.menu.menuElement.style.minWidth = '380px';
    menuHandler.menu.menuElement.style.maxWidth = '380px';
    menuHandler.menu.menuElement.style.borderRadius = '10px';
    menuHandler.menu.menuElement.style.padding = '12px';
    menuHandler.menu.menuElement.style.gap = '10px';
    requestAnimationFrame(() => {
      const bodyEl =
        menuHandler.menu.menuElement.querySelector<HTMLElement>(
          '.affine-menu-body'
        );
      if (bodyEl) {
        bodyEl.style.overflowY = 'auto';
        bodyEl.style.flex = '1';
        bodyEl.style.minHeight = '0';
      }
    });
  }
  return menuHandler;
};
