import {
  menu,
  popMenu,
  type PopupTarget,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  ArrowDownSmallIcon,
  CloseIcon,
  DeleteIcon,
  PlusIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { Middleware } from '@floating-ui/dom';
import { computed } from '@preact/signals-core';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';

import { renderUniLit } from '../../../core/index.js';
import { popCreateSort } from '../../../core/sort/add-sort.js';
import type { SortBy } from '../../../core/sort/types.js';
import type { SortUtils } from '../../../core/sort/utils.js';
import { dragHandler } from '../../../core/utils/wc-dnd/dnd-context.js';
import { defaultActivators } from '../../../core/utils/wc-dnd/sensors/index.js';
import {
  createSortContext,
  sortable,
} from '../../../core/utils/wc-dnd/sort/sort-context.js';
import { verticalListSortingStrategy } from '../../../core/utils/wc-dnd/sort/strategies/index.js';

export class SortRootView extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .sort-root-container {
      margin-bottom: 8px;
      gap: 8px;
      display: flex;
      flex-direction: column;
    }

    .sort-item {
      display: flex;
      align-items: center;
    }
  `;

  @property({ attribute: false })
  accessor sortUtils!: SortUtils;

  items$ = computed(() => {
    return this.sortUtils.sortList$.value.map(v => v.ref.name);
  });

  sortContext = createSortContext({
    activators: defaultActivators,
    container: this,
    onDragEnd: evt => {
      const over = evt.over;
      if (over) {
        const list = this.sortUtils.sortList$.value;
        this.sortUtils.move(
          list.findIndex(v => v.ref.name === evt.active.id),
          list.findIndex(v => v.ref.name === over.id)
        );
      }
    },
    modifiers: [
      ({ transform }) => {
        return {
          ...transform,
          x: 0,
        };
      },
    ],
    items: this.items$,
    strategy: verticalListSortingStrategy,
  });

  override render() {
    const list = this.sortUtils.sortList$.value;
    return html`
      <div class="sort-root-container">
        ${repeat(list, (sort, index) => {
          const id = sort.ref.name;
          const variable = this.sortUtils.vars$.value.find(v => v.id === id);
          let content;
          const deleteRule = () => {
            this.sortUtils.remove(index);
          };
          const changeRule = (rule: SortBy) => {
            this.sortUtils.change(index, rule);
          };
          if (!variable) {
            content = html`
              <data-view-component-button
                style="color: var(--affine-error-color);border-color: color: var(--affine-error-color)"
                @click="${deleteRule}"
                .text="${html`This rule is invalid, click to delete`}"
              ></data-view-component-button>
            `;
          } else {
            const descName = sort.desc ? 'Descending' : 'Ascending';
            const clickField = (event: MouseEvent) => {
              popMenu(
                popupTargetFromElement(event.currentTarget as HTMLElement),
                {
                  options: {
                    items: this.sortUtils.vars$.value.map(v => {
                      return menu.action({
                        name: v.name,
                        prefix: renderUniLit(v.icon),
                        isSelected: v.id === id,
                        select: () => {
                          changeRule({
                            ...sort,
                            ref: { type: 'ref', name: v.id },
                          });
                        },
                      });
                    }),
                  },
                }
              );
            };
            const clickOrder = (event: MouseEvent) => {
              popMenu(
                popupTargetFromElement(event.currentTarget as HTMLElement),
                {
                  options: {
                    items: [false, true].map(desc => {
                      return menu.action({
                        name: desc ? 'Descending' : 'Ascending',
                        isSelected: desc === sort.desc,
                        select: () => {
                          changeRule({ ...sort, desc });
                        },
                      });
                    }),
                  },
                }
              );
            };
            content = html`
              <data-view-component-button
                style="margin-right: 6px;margin-left: 4px"
                @click="${clickField}"
                .icon="${renderUniLit(variable.icon)}"
                .text="${variable.name}"
                .postfix="${ArrowDownSmallIcon()}"
              ></data-view-component-button>
              <data-view-component-button
                @click="${clickOrder}"
                .text="${html` <div style="padding: 0 4px">${descName}</div>`}"
                .postfix="${ArrowDownSmallIcon()}"
              ></data-view-component-button>
            `;
          }
          return keyed(
            id,
            html`
              <div
                ${sortable(id)}
                class='sort-item'
              >
                <div style='display: flex;align-items: center;flex:1;margin-right: 16px;'>
                  <div
                    ${dragHandler(id)}
                    style='border-radius:2px;cursor:pointer;width: 4px;height: 12px;background-color: ${unsafeCSSVarV2(
                      'button/grabber/default'
                    )}'
                  ></div>
                  ${content}
                </div>
                <div
                  @click='${deleteRule}'
                  style='padding: 2px;display: flex;align-items: center;border-radius: 2px;color:${unsafeCSSVarV2('icon/primary')}'
                  class='dv-hover dv-rounded'>${CloseIcon({ width: '16px', height: '16px' })}
                </div>
              </div>
              </div>
            `
          );
        })}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sort-root-view': SortRootView;
  }
}

export const popSortRoot = (
  target: PopupTarget,
  props: {
    sortUtils: SortUtils;
    title?: {
      text: string;
      onBack?: () => void;
      onClose?: () => void;
    };
  },
  middleware?: Array<Middleware | null | undefined | false>
) => {
  const sortUtils = props.sortUtils;
  const handler = popMenu(target, {
    middleware,
    options: {
      title: props.title,
      items: [
        () => {
          return html` <sort-root-view
            .sortUtils="${sortUtils}"
          ></sort-root-view>`;
        },
        menu.action({
          name: 'Add sort',
          prefix: PlusIcon(),
          select: ele => {
            popCreateSort(popupTargetFromElement(ele), {
              sortUtils: props.sortUtils,
            });
            return false;
          },
        }),
        menu.action({
          name: 'Delete',
          class: { 'delete-item': true },
          prefix: DeleteIcon(),
          select: () => {
            props.sortUtils.removeAll();
          },
        }),
      ],
    },
  });
  handler.menu.menuElement.style.minHeight = '550px';
};
