import {
  menu,
  type MenuConfig,
  popMenu,
  type PopupTarget,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher } from '@blocksuite/global/lit';
import {
  ArrowDownSmallIcon,
  ArrowRightSmallIcon,
  DeleteIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { autoPlacement, offset, shift } from '@floating-ui/dom';
import { computed, type ReadonlySignal } from '@preact/signals-core';
import { addDays } from 'date-fns/addDays';
import { subDays } from 'date-fns/subDays';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';

import { getRefType } from '../../../core/expression/ref/ref.js';
import type { Variable } from '../../../core/expression/types.js';
import { filterMatcher } from '../../../core/filter/filter-fn/matcher.js';
import { literalItemsMatcher } from '../../../core/filter/literal/index.js';
import type { Filter, SingleFilter } from '../../../core/filter/types.js';
import { renderUniLit, t, typeSystem } from '../../../core/index.js';

export class FilterConditionView extends SignalWatcher(ShadowlessElement) {
  static override styles = css`
    .filter-condition-delete {
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      height: max-content;
      cursor: pointer;
    }
    .filter-condition-delete:hover {
      background-color: var(--affine-hover-color);
    }
    .filter-condition-delete svg {
      width: 16px;
      height: 16px;
    }
  `;

  @property({ attribute: false }) accessor value!: ReadonlySignal<Filter[]>;
  @property({ attribute: false }) accessor vars!: ReadonlySignal<Variable[]>;
  @property({ attribute: false }) accessor index!: number;
  @property({ attribute: false }) accessor onChange!: (
    filters: Filter[]
  ) => void;

  private get filter$() {
    const f = this.value.value[this.index];
    return f && f.type === 'filter' ? f : undefined;
  }

  private get fnConfig$() {
    return filterMatcher.getFilterByName(this.filter$?.function);
  }

  private get fnType$() {
    const fn = this.fnConfig$;
    const filter = this.filter$;
    if (!fn || !filter) return undefined;
    const refType = getRefType(this.vars.value, filter.left);
    if (!refType) return undefined;
    return typeSystem.instanceFn(
      t.fn.instance([fn.self, ...fn.args], t.boolean.instance(), fn.vars),
      [refType],
      t.boolean.instance(),
      {}
    );
  }

private get leftVar$() {
  return this.vars.value.find(v => v.id === this.filter$?.left.name);
}

private setFilter(filter: SingleFilter) {
  const list = this.value.value.slice();
  list[this.index] = filter;
  this.onChange(list);
}

private getArgsItems(): MenuConfig[] {
  const f = this.filter$;
  const fnType = this.fnType$;
  if (!f || !fnType) return [];

  return fnType.args.slice(1).flatMap((argType, argIndex) =>
    literalItemsMatcher.getItems(
      argType,
      computed(() => f.args[argIndex]?.value),
      (newValue: unknown) => {
        const newArgs = f.args.slice();
        newArgs[argIndex] = { type: 'literal', value: newValue };
        this.setFilter({ ...f, args: newArgs });
      }
    )
  );
}

private getFunctionItems(_target?: PopupTarget, closeParent?: () => void) {
  const filter = this.filter$.value;
  if (!filter) return [];

  const refType = getRefType(this.vars.value, filter.left);
  if (!refType) return [];

  return filterMatcher.filterListBySelfType(refType).map(v =>
    menu.action({
      name: v.label,
      isSelected: v.name === filter.function,
      select: () => {
        const next: SingleFilter = {
          ...filter,
          function: v.name,
          args: [],
        };

        if (v.name === 'relativeToToday') {
          next.args = [{ type: 'literal', value: ['this', 'week'] }];
        } else if (v.name === 'before' || v.name === 'after') {
          // Default date using date-fns to avoid DST edge weirdness.
          const defaultDate =
            v.name === 'before'
              ? subDays(new Date(), 1).getTime()
              : addDays(new Date(), 1).getTime();

          next.args = [{ type: 'literal', value: defaultDate }];
        }

        this.setFilter(next);

        // Close the parent menu so the main menu refreshes.
        closeParent?.();

        // Close the submenu.
        return false;
      },
    })
  );
}

private readonly popConditionEdit = (target: PopupTarget) => {
  const type = this.leftVar$.value?.type;
  if (!type) return;

  const fn = this.fnConfig$.value;
  if (!fn) {
    popFilterableSimpleMenu(target, this.getFunctionItems(target));
    return;
  }

  const handler = popMenu(target, {
    middleware: [
      autoPlacement({
        allowedPlacements: ['bottom-start', 'bottom', 'top-start', 'top'],
      }),
      offset({ mainAxis: 4, crossAxis: 0 }),
      shift({ crossAxis: true }),
    ],
    options: {
      items: [
        menu.dynamic(() => {
          const currentFn = this.fnConfig$.value;
          if (!currentFn) return [];

          return [
            menu.group({
              items: [
                menu.action({
                  name: currentFn.label,
                  postfix: ArrowRightSmallIcon(),
                  select: ele => {
                    popMenu(popupTargetFromElement(ele), {
                      middleware: [
                        offset({ mainAxis: 4, crossAxis: 0 }),
                        autoPlacement({
                          allowedPlacements: [
                            'bottom-start',
                            'bottom',
                            'top-start',
                            'top',
                          ],
                        }),
                        shift({ crossAxis: true }),
                      ],
                      options: {
                        items: [
                          menu.group({
                            items: this.getFunctionItems(target, () => {
                              handler.close();
                            }),
                          }),
                        ],
                      },
                    });

                    // Keep the main menu open while the submenu is shown.
                    return false;
                  },
                }),
              ],
            }),
          ];
        }),
      ],
    },
  });

  return handler;
};


                      // Pop submenu on click below the button
                      const { menu: dropdownMenu } = popMenu(
                        popupTargetFromElement(ele),
                        {
                          middleware: dropdownMiddleware,
                          options: {
                            items: [
                              menu.group({
                                items: fnItems,
                              }),
                            ],
                          },
                        }
                      );

                      // Set higher z-index to ensure dropdown appears on top
                      if (dropdownMenu?.menuElement) {
                        dropdownMenu.menuElement.dataset.layer = 'raised';
                      }
                      // Keep main menu open
                      return false;
                    },
                    middleware: [
                      autoPlacement({
                        allowedPlacements: ['bottom-start'],
                      }),
                      offset({ mainAxis: 4, crossAxis: 0 }),
                      shift({ crossAxis: true }),
                    ],
                  });
                  // allow submenu height and width to adjust to content
                  subHandler.menu.menuElement.style.minHeight = 'fit-content';
                  subHandler.menu.menuElement.style.maxHeight = 'fit-content';
                  subHandler.menu.menuElement.style.minWidth = '200px';
                  return false;
                },
              }),
            ];
          }),
          // Dynamic literal section that shows date picker or other inputs
          menu.dynamic(() => {
            const items = this.getArgsItems();
            // Only show this section if there are items to display
            return items.length > 0 ? items : [];
          }),
          // Delete button
          menu.group({
            items: [
              menu.action({
                name: 'Delete',
                class: { 'delete-item': true },
                prefix: DeleteIcon(),
                select: () => {
                  const list = this.value.value.slice();
                  list.splice(this.index, 1);
                  this.onChange(list);
                },
              }),
            ],
          }),
        ],
      },
    });
    // allow main menu height and width to adjust to calendar size
    handler.menu.menuElement.style.minHeight = 'fit-content';
    handler.menu.menuElement.style.maxHeight = 'fit-content';
    handler.menu.menuElement.style.minWidth = '200px';
  };

  private get buttonText() {
    const name = this.leftVar$?.name ?? '';
    const filter = this.filter$;
    const fn = this.fnConfig$;
    if (!filter || !fn) return name;

    if (fn.name === 'relativeToToday') {
      const tuple = filter.args[0]?.value as [string, string] | undefined;
      const dirRaw = tuple?.[0] ?? 'this';
      const unitRaw = tuple?.[1] ?? 'week';
      const dir = dirRaw.charAt(0).toUpperCase() + dirRaw.slice(1);
      return `${name}: ${dir} ${unitRaw}`;
    }

    const arg = filter.args[0]?.value;
    if ((fn.name === 'before' || fn.name === 'after') && !arg) {
      return `${name}: ${fn.label}`;
    }

    type ShortStringParams = Parameters<NonNullable<typeof fn.shortString>>;
    const literalArgs = filter.args ?? [];
    const shortStringArgs = fn.args.map((argType, index) => {
      const literal = literalArgs[index];
      if (!literal) return undefined;
      return { value: literal.value, type: argType };
    }) as ShortStringParams;
    const str = fn.shortString ? fn.shortString(...shortStringArgs) : '';
    return str ? `${name}${str}` : name;
  }

  override render() {
    const leftVar = this.leftVar$;
    if (!leftVar) {
      return html`<data-view-component-button
        hoverType="border"
        .text=${html`Invalid filter`}
      ></data-view-component-button>`;
    }

    return html`<data-view-component-button
      hoverType="border"
      .icon=${renderUniLit(leftVar.icon)}
      @click=${(e: Event) =>
        this.popConditionEdit(
          popupTargetFromElement(e.currentTarget as HTMLElement)
        )}
      .text=${html`<span
        style="overflow:hidden;max-width:230px;text-overflow:ellipsis"
      >
        ${this.buttonText}
      </span>`}
      .postfix=${ArrowDownSmallIcon()}
    ></data-view-component-button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'filter-condition-view': FilterConditionView;
  }
}
