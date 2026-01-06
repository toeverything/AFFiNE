import {
  menu,
  type MenuConfig,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ArrowDownSmallIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { Text } from '@blocksuite/store';
import { autoPlacement, offset } from '@floating-ui/dom';
import { computed, signal } from '@preact/signals-core';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { typeSystem } from '../../../../../../core';
import type { Group } from '../../../../../../core/group-by/trait';
import { statsFunctions } from '../../../../../../core/statistics';
import type { StatisticsConfig } from '../../../../../../core/statistics/types';
import type { TableProperty } from '../../../../table-view-manager';

const styles = css`
  .stats-cell {
    cursor: pointer;
    transition: opacity 230ms ease;
    font-size: 12px;
    color: var(--affine-text-secondary-color);
    display: flex;
    opacity: 0;
    justify-content: flex-end;
    height: 100%;
    align-items: center;
    user-select: none;
  }

  affine-database-virtual-column-stats:hover .stats-cell {
    opacity: 1;
  }

  .stats-cell:hover,
  affine-database-virtual-column-stats-cell.active .stats-cell {
    opacity: 1;
    background-color: var(--affine-hover-color);
    cursor: pointer;
  }

  .stats-cell[calculated='true'] {
    opacity: 1;
  }

  .stats-cell .content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    margin-inline: 5px;
  }

  .stats-cell .label {
    text-transform: uppercase;
    color: var(--affine-text-secondary-color);
  }

  .stats-cell .value {
    color: var(--affine-text-primary-color);
  }
`;

export class VirtualDatabaseColumnStatsCell extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  @property({ attribute: false })
  accessor column!: TableProperty;

  cellValues$ = computed(() => {
    if (this.group) {
      return this.group.rows.map(row => {
        return this.column.valueGet(row.rowId);
      });
    }
    return this.column.cells$.value.map(cell => cell.jsonValue$.value);
  });

  groups$ = computed(() => {
    const groups: Record<string, Record<string, StatisticsConfig>> = {};

    statsFunctions.forEach(func => {
      if (!typeSystem.unify(this.column.dataType$.value, func.dataType)) {
        return;
      }
      if (!groups[func.group]) {
        groups[func.group] = {};
      }
      const oldFunc = groups[func.group]?.[func.type];
      if (!oldFunc || typeSystem.unify(func.dataType, oldFunc.dataType)) {
        if (!func.impl) {
          delete groups[func.group]?.[func.type];
        } else {
          const group = groups[func.group];
          if (group) {
            group[func.type] = func;
          }
        }
      }
    });
    return groups;
  });

  openMenu = (ev: MouseEvent) => {
    const menus: MenuConfig[] = Object.entries(this.groups$.value).map(
      ([group, funcs]) => {
        return menu.subMenu({
          name: group,
          options: {
            items: Object.values(funcs).map(func => {
              return menu.action({
                isSelected: func.type === this.column.statCalcOp$.value,
                name: func.menuName ?? func.type,
                select: () => {
                  this.column.updateStatCalcOp(func.type);
                },
              });
            }),
          },
        });
      }
    );
    popMenu(popupTargetFromElement(ev.currentTarget as HTMLElement), {
      options: {
        items: [
          menu.action({
            isSelected: !this.column.statCalcOp$.value,
            name: 'None',
            select: () => {
              this.column.updateStatCalcOp();
            },
          }),
          ...menus,
        ],
      },
      middleware: [
        autoPlacement({ allowedPlacements: ['top', 'bottom'] }),
        offset(10),
      ],
    });
  };

  statsFunc$ = computed(() => {
    return Object.values(this.groups$.value)
      .flatMap(group => Object.values(group))
      .find(func => func.type === this.column.statCalcOp$.value);
  });

  values$ = signal<unknown[]>([]);

  statsResult$ = computed(() => {
    const meta = this.column.meta$.value;
    if (!meta) {
      return null;
    }
    const func = this.statsFunc$.value;
    if (!func) {
      return null;
    }
    return {
      name: func.displayName,
      value:
        func.impl?.(this.values$.value, {
          meta,
          dataSource: this.column.view.manager.dataSource,
        }) ?? '',
    };
  });

  subscriptionMap = new Map<unknown, () => void>();

  override connectedCallback(): void {
    super.connectedCallback();
    this.disposables.addFromEvent(this, 'click', this.openMenu);
    this.disposables.add(
      this.cellValues$.subscribe(values => {
        const map = new Map<unknown, () => void>();
        values.forEach(value => {
          if (value instanceof Text) {
            const unsub = this.subscriptionMap.get(value);
            if (unsub) {
              map.set(value, unsub);
              this.subscriptionMap.delete(value);
            } else {
              const f = () => {
                this.values$.value = [...this.cellValues$.value];
              };
              value.yText.observe(f);
              map.set(value, () => {
                value.yText.unobserve(f);
              });
            }
          }
        });
        this.subscriptionMap.forEach(unsub => {
          unsub();
        });
        this.subscriptionMap = map;
        this.values$.value = this.cellValues$.value;
      })
    );
    this.disposables.add(() => {
      this.subscriptionMap.forEach(unsub => {
        unsub();
      });
      this.subscriptionMap.clear();
    });
  }

  protected override render() {
    const style = {
      width: `${this.column.width$.value}px`,
    };
    return html` <div
      calculated="${!!this.column.statCalcOp$.value}"
      style="${styleMap(style)}"
      class="stats-cell"
    >
      <div class="content">
        ${!this.statsResult$.value
          ? html`Calculate ${ArrowDownSmallIcon()}`
          : html`
              <span class="label">${this.statsResult$.value.name}</span>
              <span class="value">${this.statsResult$.value.value} </span>
            `}
      </div>
    </div>`;
  }

  @property({ attribute: false })
  accessor group: Group | undefined = undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-database-virtual-column-stats-cell': VirtualDatabaseColumnStatsCell;
  }
}
