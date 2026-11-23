import {
  menu,
  popMenu,
  type PopupTarget,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher } from '@blocksuite/global/lit';
import {
  ArrowDownSmallIcon,
  ConvertIcon,
  DeleteIcon,
  DuplicateIcon,
  FilterIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { type Middleware, offset } from '@floating-ui/dom';
import { computed, type ReadonlySignal } from '@preact/signals-core';
import { css, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import type { Variable } from '../../../core/expression/types.js';
import type { FilterTrait } from '../../../core/filter/trait.js';
import type { Filter, FilterGroup } from '../../../core/filter/types.js';
import {
  type DataViewUILogicBase,
  popCreateFilter,
} from '../../../core/index.js';
import {
  type FilterGroupView,
  getDepth,
  popFilterGroup,
} from './group-panel-view.js';

export class FilterRootView extends SignalWatcher(ShadowlessElement) {
  static override styles = css`
    .filter-root-title {
      padding: 12px;
      font-size: 14px;
      font-weight: 600;
      line-height: 22px;
      color: var(--affine-text-primary-color);
    }

    .filter-root-op {
      width: 60px;
      display: flex;
      justify-content: end;
      padding: 4px;
      height: 34px;
      align-items: center;
    }

    .filter-root-op-clickable {
      border-radius: 4px;
      cursor: pointer;
    }

    .filter-root-op-clickable:hover {
      background-color: var(--affine-hover-color);
    }

    .filter-root-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 400px;
      overflow: auto;
    }

    .filter-root-button {
      margin: 4px 8px 8px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      line-height: 22px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--affine-text-secondary-color);
    }

    .filter-root-button svg {
      fill: var(--affine-text-secondary-color);
      color: var(--affine-text-secondary-color);
      width: 20px;
      height: 20px;
    }

    .filter-root-button:hover {
      background-color: var(--affine-hover-color);
      color: var(--affine-text-primary-color);
    }

    .filter-root-button:hover svg {
      fill: var(--affine-text-primary-color);
      color: var(--affine-text-primary-color);
    }

    .filter-root-item {
      padding: 4px 0;
      display: flex;
      align-items: start;
      gap: 8px;
    }

    .filter-group-title {
      font-size: 14px;
      font-style: normal;
      font-weight: 500;
      line-height: 22px;
      display: flex;
      align-items: center;
      color: var(--affine-text-primary-color);
      gap: 6px;
    }

    .filter-root-item-ops {
      margin-top: 2px;
      padding: 4px;
      border-radius: 4px;
      height: max-content;
      display: flex;
      cursor: pointer;
    }

    .filter-root-item-ops:hover {
      background-color: var(--affine-hover-color);
    }

    .filter-root-item-ops svg {
      fill: var(--affine-text-secondary-color);
      color: var(--affine-text-secondary-color);
      width: 18px;
      height: 18px;
    }

    .filter-root-item-ops:hover svg {
      fill: var(--affine-text-primary-color);
      color: var(--affine-text-primary-color);
    }

    .filter-root-grabber {
      cursor: grab;
      width: 4px;
      height: 12px;
      background-color: var(--affine-placeholder-color);
      border-radius: 1px;
    }

    .divider {
      height: 1px;
      background-color: var(--affine-divider-color);
      flex-shrink: 0;
      margin: 8px 0;
    }
  `;

  private readonly _setFilter = (index: number, filter: Filter) => {
    this.onChange({
      ...this.filterGroup.value,
      conditions: this.filterGroup.value.conditions.map((v, i) =>
        index === i ? filter : v
      ),
    });
  };

  private readonly expandGroup = (position: PopupTarget, i: number) => {
    if (this.filterGroup.value.conditions[i]?.type !== 'group') {
      return;
    }
    popFilterGroup(position, {
      vars: this.vars,
      value$: computed(() => {
        return this.filterGroup.value.conditions[i] as FilterGroup;
      }),
      onChange: filter => {
        if (filter) {
          this._setFilter(i, filter);
        } else {
          this.deleteFilter(i);
        }
      },
    });
  };

  @property({ attribute: false })
  accessor filterGroup!: ReadonlySignal<FilterGroup>;

  conditions$ = computed(() => {
    return this.filterGroup.value.conditions;
  });

  setConditions = (conditions: Filter[]) => {
    this.onChange({
      ...this.filterGroup.value,
      conditions: conditions,
    });
  };

  private _clickConditionOps(target: HTMLElement, i: number) {
    const filter = this.filterGroup.value.conditions[i];
    if (!filter) {
      return;
    }
    const handler = popMenu(popupTargetFromElement(target), {
      placement: 'bottom-end',
      middleware: [offset({ mainAxis: 12, crossAxis: 0 })],
      options: {
        items: [
          menu.action({
            name:
              filter.type === 'filter' ? 'Turn into group' : 'Wrap in group',
            prefix: ConvertIcon(),
            hide: () => getDepth(filter) > 3,
            select: () => {
              this.onChange({
                type: 'group',
                op: 'and',
                conditions: [this.filterGroup.value],
              });
            },
          }),
          menu.action({
            name: 'Duplicate',
            prefix: DuplicateIcon(),
            select: () => {
              const conditions = [...this.filterGroup.value.conditions];
              conditions.splice(
                i + 1,
                0,
                JSON.parse(JSON.stringify(conditions[i]))
              );
              this.onChange({
                ...this.filterGroup.value,
                conditions: conditions,
              });
            },
          }),
          menu.group({
            name: '',
            items: [
              menu.action({
                name: 'Delete',
                prefix: DeleteIcon(),
                class: { 'delete-item': true },
                select: () => {
                  const conditions = [...this.filterGroup.value.conditions];
                  conditions.splice(i, 1);
                  this.onChange({
                    ...this.filterGroup.value,
                    conditions,
                  });
                },
              }),
            ],
          }),
        ],
      },
    });
    handler.menu.menuElement.style.minWidth = '200px';
    handler.menu.menuElement.style.maxWidth = 'fit-content';
    handler.menu.menuElement.style.minHeight = 'fit-content';
  }

  private deleteFilter(i: number) {
    this.onChange({
      ...this.filterGroup.value,
      conditions: this.filterGroup.value.conditions.filter(
        (_, index) => index !== i
      ),
    });
  }

  override render() {
    const data = this.filterGroup.value;
    return html`
      <div class="filter-root-container">
        ${repeat(data.conditions, (_, i) => {
          const clickOps = (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            this._clickConditionOps(e.target as HTMLElement, i);
          };
          const ops = html`
            <div class="filter-root-item-ops" @click="${clickOps}">
              ${MoreHorizontalIcon()}
            </div>
          `;
          const content = html`
            <div
              style="display:flex;align-items:center;justify-content: space-between;width: 100%;gap:8px;"
            >
              <div style="display:flex;align-items:center;gap:6px;">
                <div class="filter-root-grabber"></div>
                ${this.renderCondition(i)}
              </div>
              ${ops}
            </div>
          `;
          const classList = classMap({
            'filter-root-item': true,
            'filter-exactly-hover-container': true,
            'dv-pd-4 dv-round-4': true,
            [this.containerClass?.class ?? '']:
              this.containerClass?.index === i,
          });
          return html` <div @contextmenu="${clickOps}" class="${classList}">
            ${content}
          </div>`;
        })}
      </div>
    `;
  }

  renderCondition(i: number) {
    const condition = this.conditions$.value[i];
    if (!condition) {
      return;
    }
    if (condition.type === 'filter') {
      return html` <filter-condition-view
        .vars="${this.vars}"
        .index="${i}"
        .value="${this.conditions$}"
        .onChange="${this.setConditions}"
      ></filter-condition-view>`;
    }
    const expandGroup = (e: MouseEvent) => {
      this.expandGroup(
        popupTargetFromElement(e.currentTarget as HTMLElement),
        i
      );
    };
    const length = condition.conditions.length;
    const text = length > 1 ? `${length} rules` : `${length} rule`;
    return html` <data-view-component-button
      hoverType="border"
      .icon="${FilterIcon()}"
      @click="${expandGroup}"
      .text="${html`${text}`}"
      .postfix="${ArrowDownSmallIcon()}"
    ></data-view-component-button>`;
  }

  @state()
  accessor containerClass:
    | {
        index: number;
        class: string;
      }
    | undefined = undefined;

  @property({ attribute: false })
  accessor onBack!: () => void;

  @property({ attribute: false })
  accessor onChange!: (filter: FilterGroup) => void;

  @property({ attribute: false })
  accessor vars!: ReadonlySignal<Variable[]>;
}

declare global {
  interface HTMLElementTagNameMap {
    'filter-root-view': FilterGroupView;
  }
}
export const popFilterRoot = (
  target: PopupTarget,
  props: {
    filterTrait: FilterTrait;
    onBack: () => void;
    onClose?: () => void;
    dataViewLogic: DataViewUILogicBase;
  },
  middleware?: Array<Middleware | null | undefined | false>
) => {
  const filterTrait = props.filterTrait;
  const view = filterTrait.view;
  const handler = popMenu(target, {
    middleware,
    options: {
      title: {
        text: 'Filters',
        onBack: props.onBack,
        onClose: props.onClose,
      },
      items: [
        menu.group({
          items: [
            () => {
              return html` <filter-root-view
                .onBack="${props.onBack}"
                .vars="${view.vars$}"
                .filterGroup="${filterTrait.filter$}"
                .onChange="${filterTrait.filterSet}"
              ></filter-root-view>`;
            },
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
                    props.dataViewLogic.eventTrace('CreateDatabaseFilter', {});
                  },
                });
                return false;
              },
            }),
          ],
        }),
      ],
    },
  });
  handler.menu.menuElement.style.minHeight = '550px';
};
