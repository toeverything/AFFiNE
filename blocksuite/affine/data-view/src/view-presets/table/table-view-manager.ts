import {
  insertPositionToIndex,
  type InsertToPosition,
} from '@blocksuite/affine-shared/utils';
import { computed, type ReadonlySignal } from '@preact/signals-core';

import { evalFilter } from '../../core/filter/eval.js';
import { generateDefaultValues } from '../../core/filter/generate-default-values.js';
import { FilterTrait, filterTraitKey } from '../../core/filter/trait.js';
import type { FilterGroup } from '../../core/filter/types.js';
import { emptyFilterGroup } from '../../core/filter/utils.js';
import {
  GroupTrait,
  groupTraitKey,
  sortByManually,
} from '../../core/group-by/trait.js';
import { fromJson } from '../../core/property/utils';
import { SortManager, sortTraitKey } from '../../core/sort/manager.js';
import { PropertyBase } from '../../core/view-manager/property.js';
import { type Row, RowBase } from '../../core/view-manager/row.js';
import {
  type SingleView,
  SingleViewBase,
} from '../../core/view-manager/single-view.js';
import type { ViewManager } from '../../core/view-manager/view-manager.js';
import { DEFAULT_COLUMN_MIN_WIDTH, DEFAULT_COLUMN_WIDTH } from './consts.js';
import type { TableViewData } from './define.js';

export class TableSingleView extends SingleViewBase<TableViewData> {
  propertiesRaw$ = computed(() => {
    const needShow = new Set(this.dataSource.properties$.value);
    const result: string[] = [];
    this.data$.value?.columns.forEach(v => {
      if (needShow.has(v.id)) {
        result.push(v.id);
        needShow.delete(v.id);
      }
    });
    result.push(...needShow);
    return result.map(id => this.propertyGetOrCreate(id));
  });

  properties$ = computed(() => {
    return this.propertiesRaw$.value.filter(property => !property.hide$.value);
  });

  private readonly filter$ = computed(() => {
    return this.data$.value?.filter ?? emptyFilterGroup;
  });

  private readonly groupBy$ = computed(() => {
    return this.data$.value?.groupBy;
  });

  private readonly sortList$ = computed(() => {
    return this.data$.value?.sort;
  });

  private readonly sortManager = this.traitSet(
    sortTraitKey,
    new SortManager(this.sortList$, this, {
      setSortList: sortList => {
        this.dataUpdate(data => {
          return {
            sort: {
              ...data.sort,
              ...sortList,
            },
          };
        });
      },
    })
  );

  detailProperties$ = computed(() => {
    return this.propertiesRaw$.value.filter(
      property => property.type$.value !== 'title'
    );
  });

  filterTrait = this.traitSet(
    filterTraitKey,
    new FilterTrait(this.filter$, this, {
      filterSet: (filter: FilterGroup) => {
        this.dataUpdate(() => {
          return {
            filter,
          };
        });
      },
    })
  );

  groupTrait = this.traitSet(
    groupTraitKey,
    new GroupTrait(this.groupBy$, this, {
      groupBySet: groupBy => {
        this.dataUpdate(() => {
          return {
            groupBy,
          };
        });
      },
      sortGroup: (ids, asc) => {
        const sorted = sortByManually(
          ids,
          v => v,
          this.groupProperties.map(v => v.key)
        );
        // If descending order is requested, reverse the sorted array
        return asc === false ? sorted.reverse() : sorted;
      },
      sortRow: (key, rows) => {
        const property = this.groupProperties.find(v => v.key === key);
        return sortByManually(
          rows,
          v => v.rowId,
          property?.manuallyCardSort ?? []
        );
      },
      changeGroupSort: keys => {
        const map = new Map(this.groupProperties.map(v => [v.key, v]));
        this.dataUpdate(() => {
          return {
            groupProperties: keys.map(key => {
              const property = map.get(key);
              if (property) {
                return property;
              }
              return {
                key,
                hide: false,
                manuallyCardSort: [],
              };
            }),
          };
        });
      },
      changeRowSort: (groupKeys, groupKey, keys) => {
        const map = new Map(this.groupProperties.map(v => [v.key, v]));
        this.dataUpdate(() => {
          return {
            groupProperties: groupKeys.map(key => {
              if (key === groupKey) {
                const group = map.get(key);
                return group
                  ? {
                      ...group,
                      manuallyCardSort: keys,
                    }
                  : {
                      key,
                      hide: false,
                      manuallyCardSort: keys,
                    };
              } else {
                return (
                  map.get(key) ?? {
                    key,
                    hide: false,
                    manuallyCardSort: [],
                  }
                );
              }
            }),
          };
        });
      },
      changeGroupHide: (key, hide) => {
        this.dataUpdate(() => {
          const list = [...this.groupProperties];
          const idx = list.findIndex(g => g.key === key);
          if (idx >= 0) {
            const target = list[idx];
            if (!target) {
              return { groupProperties: list };
            }
            list[idx] = { ...target, hide };
          } else {
            const order = (this.groupTrait.groupsDataListAll$.value ?? [])
              .map(g => g?.key)
              .filter((k): k is string => !!k);
            let insertPos = 0;
            for (const k of order) {
              if (k === key) break;
              if (list.some(g => g.key === k)) insertPos++;
            }
            list.splice(insertPos, 0, { key, hide, manuallyCardSort: [] });
          }
          return { groupProperties: list };
        });
      },
    })
  );

  mainProperties$ = computed(() => {
    return (
      this.data$.value?.header ?? {
        titleColumn: this.propertiesRaw$.value.find(
          property => property.type$.value === 'title'
        )?.id,
        iconColumn: 'type',
      }
    );
  });

  readonly$ = computed(() => {
    return this.manager.readonly$.value;
  });

  get groupProperties() {
    return this.data$.value?.groupProperties ?? [];
  }

  get name(): string {
    return this.data$.value?.name ?? '';
  }

  override get type(): string {
    return this.data$.value?.mode ?? 'table';
  }

  constructor(viewManager: ViewManager, viewId: string) {
    super(viewManager, viewId);
  }

  isShow(rowId: string): boolean {
    if (this.filter$.value?.conditions.length) {
      const rowMap = Object.fromEntries(
        this.properties$.value.map(column => [
          column.id,
          column.cellGetOrCreate(rowId).jsonValue$.value,
        ])
      );
      return evalFilter(this.filter$.value, rowMap);
    }
    return true;
  }

  propertyGetOrCreate(columnId: string): TableProperty {
    return new TableProperty(this, columnId);
  }

  override rowGetOrCreate(rowId: string): TableRow {
    return new TableRow(this, rowId);
  }

  override rowAdd(
    insertPosition: InsertToPosition | number,
    groupKey?: string
  ): string {
    const id = super.rowAdd(insertPosition);

    const filter = this.filter$.value;
    if (filter.conditions.length > 0) {
      const defaultValues = generateDefaultValues(filter, this.vars$.value);
      Object.entries(defaultValues).forEach(([propertyId, jsonValue]) => {
        const property = this.propertyGetOrCreate(propertyId);
        const propertyMeta = property.meta$.value;
        if (propertyMeta) {
          const value = fromJson(propertyMeta.config, {
            value: jsonValue,
            data: property.data$.value,
            dataSource: this.dataSource,
          });
          this.cellGetOrCreate(id, propertyId).valueSet(value);
        }
      });
    }

    if (groupKey && id) {
      this.groupTrait.addToGroup(id, groupKey);
    }
    return id;
  }

  override rowsMapping(rows: Row[]) {
    return this.sortManager.sort(super.rowsMapping(rows));
  }

  readonly computedProperties$: ReadonlySignal<TableColumnData[]> = computed(
    () => {
      return this.propertiesRaw$.value.map(property => {
        return {
          id: property.id,
          hide: property.hide$.value,
          width: property.width$.value,
          statCalcType: property.statCalcOp$.value,
        };
      });
    }
  );
}

type TableColumnData = TableViewData['columns'][number];

export class TableProperty extends PropertyBase {
  override hideSet(hide: boolean): void {
    this.viewDataUpdate(data => {
      return {
        ...data,
        hide,
      };
    });
  }
  override move(position: InsertToPosition): void {
    this.tableView.dataUpdate(() => {
      const columnIndex = this.tableView.computedProperties$.value.findIndex(
        v => v.id === this.id
      );
      if (columnIndex < 0) {
        return {};
      }
      const columns = [...this.tableView.computedProperties$.value];
      const [column] = columns.splice(columnIndex, 1);
      if (!column) return {};
      const index = insertPositionToIndex(position, columns);
      columns.splice(index, 0, column);
      return {
        columns,
      };
    });
  }

  hide$ = computed(() => {
    const hideFromViewData = this.viewData$.value?.hide;
    if (hideFromViewData != null) {
      return hideFromViewData;
    }
    const defaultShow = this.meta$.value?.config.fixed?.defaultShow;
    if (defaultShow != null) {
      return !defaultShow;
    }
    return false;
  });

  statCalcOp$ = computed(() => {
    return this.viewData$.value?.statCalcType;
  });

  width$: ReadonlySignal<number> = computed(() => {
    const column = this.viewData$.value;
    if (column?.width != null) {
      return column.width;
    }
    const type = this.type$.value;
    if (type === 'title') {
      return 260;
    }
    return DEFAULT_COLUMN_WIDTH;
  });

  get minWidth() {
    return this.meta$.value?.config.minWidth ?? DEFAULT_COLUMN_MIN_WIDTH;
  }

  constructor(
    private readonly tableView: TableSingleView,
    columnId: string
  ) {
    super(tableView as SingleView, columnId);
  }

  viewDataUpdate(
    updater: (viewData: TableColumnData) => Partial<TableColumnData>
  ): void {
    this.tableView.dataUpdate(data => {
      return {
        ...data,
        columns: this.tableView.computedProperties$.value.map(v =>
          v.id === this.id ? { ...v, ...updater(v) } : v
        ),
      };
    });
  }

  viewData$ = computed(() => {
    return this.tableView.data$.value?.columns.find(v => v.id === this.id);
  });

  updateStatCalcOp(type?: string): void {
    this.viewDataUpdate(data => {
      return {
        ...data,
        statCalcType: type,
      };
    });
  }

  updateWidth(width: number): void {
    this.viewDataUpdate(data => {
      return {
        ...data,
        width,
      };
    });
  }
}
export class TableRow extends RowBase {
  override move(
    position: InsertToPosition,
    fromGroup?: string,
    toGroup?: string
  ): void {
    if (toGroup == null) {
      super.move(position);
      return;
    }
    this.tableView.groupTrait.moveCardTo(
      this.rowId,
      fromGroup,
      toGroup,
      position
    );
  }
  constructor(
    readonly tableView: TableSingleView,
    rowId: string
  ) {
    super(tableView, rowId);
  }
}
