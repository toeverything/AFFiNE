import {
  insertPositionToIndex,
  type InsertToPosition,
} from '@blocksuite/affine-shared/utils';
import { computed } from '@preact/signals-core';

import { evalFilter } from '../../core/filter/eval.js';
import { FilterTrait, filterTraitKey } from '../../core/filter/trait.js';
import { emptyFilterGroup } from '../../core/filter/utils.js';
import { SortManager, sortTraitKey } from '../../core/sort/manager.js';
import { PropertyBase } from '../../core/view-manager/property.js';
import { type Row } from '../../core/view-manager/row.js';
import { SingleViewBase } from '../../core/view-manager/single-view.js';
import type { ViewManager } from '../../core/view-manager/view-manager.js';
import type { GanttViewColumn, GanttViewData } from './define.js';

const materializeColumnsByPropertyIds = (
  columns: GanttViewColumn[],
  propertyIds: string[]
) => {
  const needShow = new Set(propertyIds);
  const orderedColumns: GanttViewColumn[] = [];

  for (const column of columns) {
    if (needShow.has(column.id)) {
      orderedColumns.push(column);
      needShow.delete(column.id);
    }
  }

  for (const id of needShow) {
    orderedColumns.push({ id });
  }

  return orderedColumns;
};

const materializeGanttColumns = (
  columns: GanttViewColumn[],
  propertyIds: string[]
) => {
  const nextColumns = materializeColumnsByPropertyIds(columns, propertyIds);
  const unchanged =
    columns.length === nextColumns.length &&
    columns.every((column, index) => {
      const nextColumn = nextColumns[index];
      return (
        nextColumn != null &&
        column.id === nextColumn.id &&
        column.hide === nextColumn.hide
      );
    });

  return unchanged ? columns : nextColumns;
};

export class GanttSingleView extends SingleViewBase<GanttViewData> {
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

  filterTrait = this.traitSet(
    filterTraitKey,
    new FilterTrait(this.filter$, this, {
      filterSet: filter => {
        this.dataUpdate(() => {
          return { filter };
        });
      },
    })
  );

  startDateColumnId$ = computed(() => {
    return this.data$.value?.startDateColumnId;
  });

  endDateColumnId$ = computed(() => {
    return this.data$.value?.endDateColumnId;
  });

  timeScale$ = computed(() => {
    return this.data$.value?.timeScale ?? 'day';
  });

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

  get type(): string {
    return 'gantt';
  }

  get view() {
    return this.data$.value;
  }

  isShow(rowId: string): boolean {
    if (this.filter$.value?.conditions.length) {
      const rowMap = Object.fromEntries(
        this.propertiesRaw$.value.map(column => [
          column.id,
          column.cellGetOrCreate(rowId).jsonValue$.value,
        ])
      );
      return evalFilter(this.filter$.value, rowMap);
    }
    return true;
  }

  propertyGetOrCreate(columnId: string): GanttProperty {
    return new GanttProperty(this, columnId);
  }

  override rowsMapping(rows: Row[]) {
    return this.sortManager.sort(super.rowsMapping(rows));
  }

  setTimeScale(timeScale: 'day' | 'week' | 'month'): void {
    this.dataUpdate(() => ({ timeScale }));
  }

  setStartDateColumn(columnId: string): void {
    this.dataUpdate(() => ({ startDateColumnId: columnId }));
  }

  setEndDateColumn(columnId: string): void {
    this.dataUpdate(() => ({ endDateColumnId: columnId }));
  }

  private materializeColumns() {
    const view = this.view;
    if (!view) {
      return;
    }

    const nextColumns = materializeGanttColumns(
      view.columns,
      this.dataSource.properties$.value
    );
    if (nextColumns === view.columns) {
      return;
    }

    this.dataUpdate(() => ({ columns: nextColumns }));
  }

  constructor(viewManager: ViewManager, viewId: string) {
    super(viewManager, viewId);
    this.materializeColumns();
  }
}

type GanttColumnData = GanttViewData['columns'][number];

export class GanttProperty extends PropertyBase {
  override move(position: InsertToPosition): void {
    this.ganttView.dataUpdate(view => {
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
      return { columns };
    });
  }

  override hideSet(hide: boolean): void {
    this.viewDataUpdate(data => {
      return { ...data, hide };
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
    return this.ganttView.data$.value?.columns.find(v => v.id === this.id);
  });

  viewDataUpdate(
    updater: (viewData: GanttColumnData) => Partial<GanttColumnData>
  ): void {
    this.ganttView.dataUpdate(data => {
      return {
        ...data,
        columns: data.columns.map(v =>
          v.id === this.id ? { ...v, ...updater(v) } : v
        ),
      };
    });
  }

  constructor(
    private readonly ganttView: GanttSingleView,
    columnId: string
  ) {
    super(ganttView, columnId);
  }
}
