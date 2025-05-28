import {
  menu,
  popMenu,
  type PopupTarget,
  popupTargetFromElement,
  subMenuMiddleware,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher } from '@blocksuite/global/lit';
import {
  ArrowDownSmallIcon,
  ArrowRightSmallIcon,
  DeleteIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed, type ReadonlySignal } from '@preact/signals-core';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import type { Value } from '../../../core/expression/types.js';

import { getRefType } from '../../../core/expression/ref/ref.js';
import type { Variable } from '../../../core/expression/types.js';
import { filterMatcher } from '../../../core/filter/filter-fn/matcher.js';
import { literalItemsMatcher } from '../../../core/filter/literal/index.js';
import type { Filter, SingleFilter } from '../../../core/filter/types.js';
import {
  renderUniLit,
  t,
  type TypeInstance,
  typeSystem,
} from '../../../core/index.js';

const DIRECTIONS = ['past', 'this', 'next'] as const;
const UNITS = ['day', 'week', 'month', 'year'] as const;

const lit = <T,>(v: T): Value => ({ type: 'literal', value: v });

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
  @property({ attribute: false }) accessor onChange!: (filters: Filter[]) => void;

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
    if (!fn || !filter) return;
    const refType = getRefType(this.vars.value, filter.left);
    if (!refType) return;
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

  private directionMenu(filter: SingleFilter) {
    const current = (filter.args[0]?.value as string) ?? 'this';
    return DIRECTIONS.map(dir =>
      menu.action({
        name: dir.charAt(0).toUpperCase() + dir.slice(1),
        isSelected: current === dir,
        select: () => {
          this.setFilter({
            ...filter,
            args: [lit(dir), filter.args[1] ?? lit('week')],
          });
        },
      })
    );
  }

  private unitMenu(filter: SingleFilter) {
    const current = (filter.args[1]?.value as string) ?? 'week';
    return UNITS.map(u =>
      menu.action({
        name: u.charAt(0).toUpperCase() + u.slice(1),
        isSelected: current === u,
        select: () => {
          this.setFilter({
            ...filter,
            args: [filter.args[0] ?? lit('this'), lit(u)],
          });
        },
      })
    );
  }

  private relativeArgsItems(filter: SingleFilter) {
    return [
      menu.group({ items: this.directionMenu(filter) }),
      menu.group({ items: this.unitMenu(filter) }),
    ];
  }

  private getArgItems(argType: TypeInstance, index: number) {
    return literalItemsMatcher.getItems(
      argType,
      computed(() => this.filter$?.args[index]?.value),
      value => {
        const filter = this.filter$;
        if (!filter) return;
        const args = filter.args.slice();
        args[index] = { type: 'literal', value };
        this.setFilter({ ...filter, args });
      }
    );
  }

  private getArgsItems() {
    const f = this.filter$;
    if (!f) return [];

    if (f.function === 'relativeToToday') {
      return this.relativeArgsItems(f);
    }

    return (
      this.fnType$?.args
        .slice(1)
        .flatMap((arg, i) => this.getArgItems(arg, i)) ?? []
    );
  }

  private getFunctionItems(target: PopupTarget) {
    const filter = this.filter$;
    if (!filter) return [];
    const refType = getRefType(this.vars.value, filter.left);
    if (!refType) return [];

    return filterMatcher.filterListBySelfType(refType).map(v => {
      return menu.action({
        name: v.label,
        isSelected: v.name === filter.function,
        select: () => {
          const next: SingleFilter = {
            ...filter,
            function: v.name,
            args: [],
          };
          if (v.name === 'relativeToToday') {
            next.args = [
              { type: 'literal', value: 'this' },
              { type: 'literal', value: 'week' },
            ];
          }
          this.setFilter(next);
          this.popConditionEdit(target);
        },
      });
    });
  }

  private popConditionEdit(target: PopupTarget) {
    const filter = this.filter$;
    const fn = this.fnConfig$;
    const leftVar = this.leftVar$;
    if (!filter || !fn || !leftVar) return;

    popMenu(target, {
      options: {
        items: [
          menu.group({
            items: [
              menu.action({
                name: fn.label,
                postfix: ArrowRightSmallIcon(),
                select: el => {
                  popMenu(popupTargetFromElement(el), {
                    options: {
                      items: [
                        menu.group({
                          items: this.getFunctionItems(target),
                        }),
                      ],
                    },
                    middleware: subMenuMiddleware,
                  });
                  return false;
                },
              }),
            ],
          }),

          menu.dynamic(() => this.getArgsItems()),

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
  }

  private get buttonText() {
    const name = this.leftVar$?.name ?? '';
    const filter = this.filter$;
    const fn = this.fnConfig$;
    if (!filter || !fn) return name;

    if (fn.name === 'relativeToToday') {
      const dir = ((filter.args[0]?.value as string) ?? 'this').replace(
        /^./,
        s => s.toUpperCase()
      );
      const unit = (filter.args[1]?.value as string) ?? 'week';
      return `${name}: ${dir} ${unit}`;
    }

    const arg = filter.args[0]?.value;
    if ((fn.name === 'before' || fn.name === 'after') && !arg) {
      return `${name}: ${fn.label}`;
    }

    const vals = (filter.args ?? []).map(a => a?.value);
    const str =
      fn.shortString?.(...vals.map(v => ({ value: v, type: null } as any))) ??
      '';
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
        >${this.buttonText}</span>`}
      .postfix=${ArrowDownSmallIcon()}
    ></data-view-component-button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'filter-condition-view': FilterConditionView;
  }
}
