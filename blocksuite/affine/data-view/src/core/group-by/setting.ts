import {
  dropdownSubMenuMiddleware,
  menu,
  type MenuConfig,
  type MenuOptions,
  popMenu,
  type PopupTarget,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { DeleteIcon, InvisibleIcon, ViewIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { Middleware } from '@floating-ui/dom';
import { autoPlacement, offset, shift } from '@floating-ui/dom';
import { computed } from '@preact/signals-core';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, unsafeCSS } from 'lit';
import { property, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { KanbanSingleView } from '../../view-presets/kanban/kanban-view-manager.js';
import { TableSingleView } from '../../view-presets/table/table-view-manager.js';
import { dataViewCssVariable } from '../common/css-variable.js';
import { renderUniLit } from '../utils/uni-component/uni-component.js';
import { dragHandler } from '../utils/wc-dnd/dnd-context.js';
import { defaultActivators } from '../utils/wc-dnd/sensors/index.js';
import {
  createSortContext,
  sortable,
} from '../utils/wc-dnd/sort/sort-context.js';
import { verticalListSortingStrategy } from '../utils/wc-dnd/sort/strategies/index.js';
import { getGroupByService } from './matcher.js';
import type { GroupTrait } from './trait.js';
import type { GroupRenderProps } from './types.js';

const dateModeLabel = (key?: string) => {
  switch (key) {
    case 'date-relative':
      return 'Relative';
    case 'date-day':
      return 'Day';
    case 'date-week-mon':
    case 'date-week-sun':
      return 'Week';
    case 'date-month':
      return 'Month';
    case 'date-year':
      return 'Year';
    default:
      return '';
  }
};

export class GroupSetting extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    data-view-group-setting {
      display: flex;
      flex-direction: column;
      gap: 4px;
      ${unsafeCSS(dataViewCssVariable())};
    }

    .group-sort-setting {
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 1;
      max-height: 200px;
      overflow: hidden auto;
      margin-right: 0;
      margin-bottom: 0;
    }

    /* WebKit-based browser scrollbar styling */
    .group-sort-setting::-webkit-scrollbar {
      width: 8px;
    }

    .group-sort-setting::-webkit-scrollbar-thumb {
      background-color: #b0b0b0; /* Grey slider */
      border-radius: 4px;
    }

    .group-sort-setting::-webkit-scrollbar-track {
      background: transparent;
    }

    .group-sort-setting {
      scrollbar-width: thin;
      scrollbar-color: #b0b0b0 transparent;
    }
    .group-hidden {
      opacity: 0.5;
    }
    .group-item {
      display: flex;
      padding: 4px 12px;
      position: relative;
      cursor: grab;
    }
    .group-item-drag-bar {
      width: 4px;
      height: 12px;
      border-radius: 1px;
      background-color: #efeff0;
      position: absolute;
      left: 4px;
      top: 0;
      bottom: 0;
      margin: auto;
    }
    .group-item:hover .group-item-drag-bar {
      background-color: #c0bfc1;
    }
    .group-item-op-icon {
      display: flex;
      align-items: center;
      border-radius: 4px;
    }
    .group-item-op-icon:hover {
      background-color: var(--affine-hover-color);
    }
    .group-item-op-icon svg {
      fill: var(--affine-icon-color);
      color: var(--affine-icon-color);
      width: 20px;
      height: 20px;
    }

    .group-item-name {
      font-size: 14px;
      line-height: 22px;
      flex: 1;
    }

    .properties-group-op {
      padding: 4px 8px;
      font-size: 12px;
      line-height: 20px;
      font-weight: 500;
      border-radius: 4px;
      cursor: pointer;
      color: ${unsafeCSS(cssVarV2.button.primary)};
    }

    .properties-group-op:hover {
      background-color: var(--affine-hover-color);
    }
  `;

  @property({ attribute: false })
  accessor groupTrait!: GroupTrait;

  groups$ = computed(() => this.groupTrait.groupsDataListAll$.value);

  sortContext = createSortContext({
    activators: defaultActivators,
    container: this,
    onDragEnd: evt => {
      const over = evt.over;
      const activeId = evt.active.id;
      const groups = this.groups$.value;
      if (over && over.id !== activeId && groups) {
        const aIndex = groups.findIndex(g => g?.key === activeId);
        const oIndex = groups.findIndex(g => g?.key === over.id);
        this.groupTrait.moveGroupTo(
          activeId,
          aIndex > oIndex
            ? { before: true, id: over.id }
            : { before: false, id: over.id }
        );
      }
    },
    modifiers: [({ transform }) => ({ ...transform, x: 0 })],
    items: computed(
      () =>
        this.groupTrait.groupsDataListAll$.value?.map(v => v?.key ?? '') ?? []
    ),
    strategy: verticalListSortingStrategy,
  });

  override connectedCallback() {
    super.connectedCallback();
    this._disposables.addFromEvent(this, 'pointerdown', e =>
      e.stopPropagation()
    );
  }

  protected override render() {
    const groups = this.groupTrait.groupsDataListAll$.value;
    if (!groups) return;
    const map = this.groupTrait.groupDataMap$.value;
    const isAllShowed = map
      ? Object.keys(map).every(k => !this.groupTrait.isGroupHidden(k))
      : true;
    const clickChangeAll = () => {
      if (!map) return;
      Object.keys(map).forEach(key => {
        this.groupTrait.setGroupHide(key, isAllShowed);
      });
    };
    return html`
      <div
        style="padding:7px 0;display:flex;justify-content:space-between;align-items:center;"
      >
        <div
          style="padding:0 4px;font-size:12px;color:var(--affine-text-secondary-color);line-height:20px;"
        >
          Groups
        </div>
        <div class="properties-group-op" @click="${clickChangeAll}">
          ${isAllShowed ? 'Hide All' : 'Show All'}
        </div>
      </div>

      <div class="group-sort-setting">
        ${repeat(
          groups,
          g => g?.key ?? 'k',
          g => {
            if (!g) return;
            const type = g.property.dataType$.value;
            if (!type) return;
            const props: GroupRenderProps = { group: g, readonly: true };
            const icon = g.hide$.value ? InvisibleIcon() : ViewIcon();
            return html`
              <div
                ${sortable(g.key)}
                ${dragHandler(g.key)}
                class="dv-hover dv-round-4 group-item ${g.hide$.value
                  ? 'group-hidden'
                  : ''}"
              >
                <div class="group-item-drag-bar"></div>
                <div
                  class="group-item-name"
                  style="padding:0 4px;position:relative;pointer-events:none;max-width:330px;"
                >
                  ${renderUniLit(g.view, props)}
                  <div
                    style="position:absolute;left:0;top:0;right:0;bottom:0;"
                  ></div>
                </div>
                <div
                  class="group-item-op-icon"
                  @click="${() => g.hideSet(!g.hide$.value)}"
                >
                  ${icon}
                </div>
              </div>
            `;
          }
        )}
      </div>
    `;
  }

  @query('.group-sort-setting') accessor groupContainer!: HTMLElement;
}

export const selectGroupByProperty = (
  group: GroupTrait,
  ops?: {
    onSelect?: (id?: string) => void;
    onClose?: () => void;
    onBack?: () => void;
  }
): MenuOptions => {
  const view = group.view;
  return {
    onClose: ops?.onClose,
    title: { text: 'Group by', onBack: ops?.onBack, onClose: ops?.onClose },
    items: [
      menu.group({
        items: view.propertiesRaw$.value
          .filter(property => {
            if (property.type$.value === 'title') {
              return false;
            }
            const dataType = property.dataType$.value;
            if (!dataType) {
              return false;
            }
            const groupByService = getGroupByService(view.manager.dataSource);
            return !!groupByService?.matcher.match(dataType);
          })
          .map<MenuConfig>(property => {
            return menu.action({
              name: property.name$.value,
              isSelected: group.property$.value?.id === property.id,
              prefix: html` <uni-lit .uni="${property.icon}"></uni-lit>`,
              select: () => {
                group.changeGroup(property.id);
                ops?.onSelect?.(property.id);
              },
            });
          }),
      }),
      menu.group({
        items: [
          menu.action({
            prefix: DeleteIcon(),
            hide: () =>
              view instanceof KanbanSingleView || !group.property$.value,
            class: { 'delete-item': true },
            name: 'Remove Grouping',
            select: () => {
              group.changeGroup(undefined);
              ops?.onSelect?.();
            },
          }),
        ],
      }),
    ],
  };
};

export const popSelectGroupByProperty = (
  target: PopupTarget,
  group: GroupTrait,
  ops?: { onSelect?: () => void; onClose?: () => void; onBack?: () => void },
  middleware?: Array<Middleware | null | undefined | false>
) => {
  const handler = popMenu(target, {
    options: selectGroupByProperty(group, ops),
    middleware,
  });
  handler.menu.menuElement.style.minHeight = '550px';
};

export const popGroupSetting = (
  target: PopupTarget,
  group: GroupTrait,
  onBack: () => void,
  onClose?: () => void,
  middleware?: Array<Middleware | null | undefined | false>
) => {
  const view = group.view;
  const gProp = group.property$.value;
  if (!gProp) return;
  const type = gProp.type$.value;
  if (!type) return;

  const icon = gProp.icon;
  const menuHandler = popMenu(target, {
    options: {
      title: {
        text: 'Group',
        onBack,
        onClose,
      },
      items: [
        menu.group({
          items: [
            menu.action({
              name: 'Group By',
              postfix: html`
                <div
                  style="display:flex;align-items:center;gap:4px;font-size:14px;line-height:20px;color:var(--affine-text-secondary-color);margin-left:8px;"
                  class="dv-icon-16"
                >
                  ${renderUniLit(icon, {})} ${gProp.name$.value}
                </div>
              `,
              select: () => {
                const subHandler = popMenu(target, {
                  options: selectGroupByProperty(group, {
                    onSelect: () => {
                      menuHandler.close();
                      popGroupSetting(
                        target,
                        group,
                        onBack,
                        onClose,
                        middleware
                      );
                    },
                    onBack: () => {
                      menuHandler.close();
                      popGroupSetting(
                        target,
                        group,
                        onBack,
                        onClose,
                        middleware
                      );
                    },
                    onClose,
                  }),
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
            }),
          ],
        }),

        ...(type === 'date'
          ? [
              menu.group({
                items: [
                  menu.dynamic(() => [
                    menu.subMenu({
                      name: 'Date by',
                      openOnHover: false,
                      middleware: dropdownSubMenuMiddleware,
                      autoHeight: true,
                      postfix: html`
                        <div
                          style="display:flex;align-items:center;gap:4px;font-size:14px;line-height:20px;color:var(--affine-text-secondary-color);margin-left:30px;"
                        >
                          ${dateModeLabel(group.groupInfo$.value?.config.name)}
                        </div>
                      `,
                      options: {
                        items: [
                          menu.dynamic(() =>
                            (
                              [
                                ['Relative', 'date-relative'],
                                ['Day', 'date-day'],
                                [
                                  'Week',
                                  group.groupInfo$.value?.config.name ===
                                  'date-week-mon'
                                    ? 'date-week-mon'
                                    : 'date-week-sun',
                                ],
                                ['Month', 'date-month'],
                                ['Year', 'date-year'],
                              ] as [string, string][]
                            ).map(
                              ([label, key]): MenuConfig =>
                                menu.action({
                                  name: label,
                                  label: () => {
                                    const isSelected =
                                      group.groupInfo$.value?.config.name ===
                                      key;
                                    return html`<span
                                      style="font-size:14px;color:${isSelected
                                        ? 'var(--affine-text-emphasis-color)'
                                        : 'var(--affine-text-secondary-color)'}"
                                      >${label}</span
                                    >`;
                                  },
                                  isSelected:
                                    group.groupInfo$.value?.config.name === key,
                                  select: () => {
                                    group.changeGroupMode(key);
                                    return false;
                                  },
                                })
                            )
                          ),
                        ],
                      },
                    }),
                  ]),
                ],
              }),

              ...(group.groupInfo$.value?.config.name?.startsWith('date-week')
                ? [
                    menu.group({
                      items: [
                        menu.dynamic(() => [
                          menu.subMenu({
                            name: 'Start week on',
                            postfix: html`
                              <div
                                style="display:flex;align-items:center;gap:4px;font-size:14px;line-height:20px;color:var(--affine-text-secondary-color);margin-left:8px;"
                              >
                                ${group.groupInfo$.value?.config.name ===
                                'date-week-mon'
                                  ? 'Monday'
                                  : 'Sunday'}
                              </div>
                            `,
                            options: {
                              items: [
                                menu.dynamic(() =>
                                  (
                                    [
                                      ['Monday', 'date-week-mon'],
                                      ['Sunday', 'date-week-sun'],
                                    ] as [string, string][]
                                  ).map(([label, key]) =>
                                    menu.action({
                                      name: label,
                                      label: () => {
                                        const isSelected =
                                          group.groupInfo$.value?.config
                                            .name === key;
                                        return html`<span
                                          style="font-size:14px;color:${isSelected
                                            ? 'var(--affine-text-emphasis-color)'
                                            : 'var(--affine-text-secondary-color)'}"
                                          >${label}</span
                                        >`;
                                      },
                                      isSelected:
                                        group.groupInfo$.value?.config.name ===
                                        key,
                                      select: () => {
                                        group.changeGroupMode(key);
                                        return false;
                                      },
                                    })
                                  )
                                ),
                              ],
                            },
                          }),
                        ]),
                      ],
                    }),
                  ]
                : []),
              menu.group({
                items: [
                  menu.dynamic(() => [
                    menu.subMenu({
                      name: 'Sort',
                      openOnHover: false,
                      middleware: dropdownSubMenuMiddleware,
                      autoHeight: true,
                      postfix: html`
                        <div
                          style="display:flex;align-items:center;gap:4px;font-size:14px;line-height:20px;color:var(--affine-text-secondary-color);margin-left:8px;"
                        >
                          ${group.sortAsc$.value
                            ? 'Oldest first'
                            : 'Newest first'}
                        </div>
                      `,
                      options: {
                        items: [
                          menu.dynamic(() => [
                            menu.action({
                              name: 'Oldest first',
                              label: () => {
                                const isSelected = group.sortAsc$.value;
                                return html`<span
                                  style="font-size:14px;color:${isSelected
                                    ? 'var(--affine-text-emphasis-color)'
                                    : 'var(--affine-text-secondary-color)'}"
                                  >Oldest first</span
                                >`;
                              },
                              isSelected: group.sortAsc$.value,
                              select: () => {
                                group.setDateSortOrder(true);
                                return false;
                              },
                            }),
                            menu.action({
                              name: 'Newest first',
                              label: () => {
                                const isSelected = !group.sortAsc$.value;
                                return html`<span
                                  style="font-size:14px;color:${isSelected
                                    ? 'var(--affine-text-emphasis-color)'
                                    : 'var(--affine-text-secondary-color)'}"
                                  >Newest first</span
                                >`;
                              },
                              isSelected: !group.sortAsc$.value,
                              select: () => {
                                group.setDateSortOrder(false);
                                return false;
                              },
                            }),
                          ]),
                        ],
                      },
                    }),
                  ]),
                ],
              }),
            ]
          : []),

        menu.group({
          items: [
            menu.dynamic(() => [
              menu.action({
                name: 'Hide empty groups',
                isSelected: group.hideEmpty$.value,
                select: () => {
                  group.setHideEmpty(!group.hideEmpty$.value);
                  return false;
                },
              }),
            ]),
          ],
        }),
        menu.group({
          items: [
            menu => html`
              <data-view-group-setting
                @mouseenter=${() => menu.closeSubMenu()}
                .groupTrait=${group}
                .columnId=${gProp.id}
              ></data-view-group-setting>
            `,
          ],
        }),

        menu.group({
          items: [
            menu.action({
              name: 'Remove grouping',
              prefix: DeleteIcon(),
              class: { 'delete-item': true },
              hide: () => !(view instanceof TableSingleView),
              select: () => {
                group.changeGroup(undefined);
                return false;
              },
            }),
          ],
        }),
      ],
    },
    middleware,
  });
  menuHandler.menu.menuElement.style.minHeight = '550px';
};
