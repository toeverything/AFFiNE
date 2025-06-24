import {
  insertPositionToIndex,
  type InsertToPosition,
} from '@blocksuite/affine-shared/utils';
import { computed } from '@preact/signals-core';

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
import { PropertyBase } from '../../core/view-manager/property.js';
import { SingleViewBase } from '../../core/view-manager/single-view.js';
import type { KanbanViewData } from './define.js';

export class KanbanSingleView extends SingleViewBase<KanbanViewData> {
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

  detailProperties$ = computed(() => {
    return this.propertiesRaw$.value.filter(
      property => property.type$.value !== 'title'
    );
  });

  filter$ = computed(() => {
    return this.data$.value?.filter ?? emptyFilterGroup;
  });

  filterTrait = this.traitSet(
    filterTraitKey,
    new FilterTrait(this.filter$, this, {
      filterSet: filter => {
        this.dataUpdate(() => {
          return {
            filter,
          };
        });
      },
    })
  );

  groupBy$ = computed(() => {
    return this.data$.value?.groupBy;
  });

  groupTrait = this.traitSet(
    groupTraitKey,
    new GroupTrait(this.groupBy$, this, {
      groupBySet: groupBy => {
        this.dataUpdate(() => {
          return {
            groupBy: groupBy,
          };
        });
      },
      sortGroup: ids =>
        sortByManually(
          ids,
          v => v,
          this.view?.groupProperties.map(v => v.key) ?? []
        ),
      sortRow: (key, rows) => {
        const property = this.view?.groupProperties.find(v => v.key === key);
        return sortByManually(
          rows,
          v => v.rowId,
          property?.manuallyCardSort ?? []
        );
      },
      changeGroupSort: keys => {
        const map = new Map(this.view?.groupProperties.map(v => [v.key, v]));
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
        const map = new Map(this.view?.groupProperties.map(v => [v.key, v]));
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

  get columns(): KanbanColumn[] {
    return this.propertiesRaw$.value.filter(property => !property.hide$.value);
  }

  get filter(): FilterGroup {
    return this.view?.filter ?? emptyFilterGroup;
  }

  get header() {
    return this.view?.header;
  }

  get type(): string {
    return this.view?.mode ?? 'kanban';
  }

  get view() {
    return this.data$.value;
  }

  addCard(position: InsertToPosition, group: string) {
    const id = this.rowAdd(position);
    this.groupTrait.addToGroup(id, group);

    const filter = this.filter$.value;
    if (filter.conditions.length > 0) {
      const defaultValues = generateDefaultValues(filter, this.vars$.value);
      Object.entries(defaultValues).forEach(([propertyId, jsonValue]) => {
        const property = this.propertyGetOrCreate(propertyId);
        const propertyMeta = property.meta$.value;
        if (!propertyMeta) {
          return;
        }
        const value = fromJson(propertyMeta.config, {
          value: jsonValue,
          data: property.data$.value,
          dataSource: this.dataSource,
        });
        this.cellGetOrCreate(id, propertyId).valueSet(value);
      });
    }

    return id;
  }

  getHeaderCover(_rowId: string): KanbanColumn | undefined {
    const columnId = this.view?.header.coverColumn;
    if (!columnId) {
      return;
    }
    return this.propertyGetOrCreate(columnId);
  }

  getHeaderIcon(_rowId: string): KanbanColumn | undefined {
    const columnId = this.view?.header.iconColumn;
    if (!columnId) {
      return;
    }
    return this.propertyGetOrCreate(columnId);
  }

  getHeaderTitle(_rowId: string): KanbanColumn | undefined {
    const columnId = this.view?.header.titleColumn;
    if (!columnId) {
      return;
    }
    return this.propertyGetOrCreate(columnId);
  }

  hasHeader(_rowId: string): boolean {
    const hd = this.view?.header;
    if (!hd) {
      return false;
    }
    return !!hd.titleColumn || !!hd.iconColumn || !!hd.coverColumn;
  }

  isInHeader(columnId: string) {
    const hd = this.view?.header;
    if (!hd) {
      return false;
    }
    return (
      hd.titleColumn === columnId ||
      hd.iconColumn === columnId ||
      hd.coverColumn === columnId
    );
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

  propertyGetOrCreate(columnId: string): KanbanColumn {
    return new KanbanColumn(this, columnId);
  }
}

type KanbanColumnData = KanbanViewData['columns'][number];
export class KanbanColumn extends PropertyBase {
  override move(position: InsertToPosition): void {
    this.kanbanView.dataUpdate(view => {
      const columnIndex = view.columns.findIndex(v => v.id === this.id);
      if (columnIndex < 0) {
        return {};
      }
      const columns = [...view.columns];
      const [column] = columns.splice(columnIndex, 1);
      if (!column) {
        return {};
      }
      const index = insertPositionToIndex(position, columns);
      columns.splice(index, 0, column);
      return {
        columns,
      };
    });
  }

  override hideSet(hide: boolean): void {
    this.viewDataUpdate(data => {
      return {
        ...data,
        hide,
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

  viewData$ = computed(() => {
    return this.kanbanView.data$.value?.columns.find(v => v.id === this.id);
  });

  viewDataUpdate(
    updater: (viewData: KanbanColumnData) => Partial<KanbanColumnData>
  ): void {
    this.kanbanView.dataUpdate(data => {
      return {
        ...data,
        columns: data.columns.map(v =>
          v.id === this.id ? { ...v, ...updater(v) } : v
        ),
      };
    });
  }

  constructor(
    private readonly kanbanView: KanbanSingleView,
    columnId: string
  ) {
    super(kanbanView, columnId);
  }
}
