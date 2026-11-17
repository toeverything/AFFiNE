import {
  insertPositionToIndex,
  type InsertToPosition,
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
} from '@blocksuite/affine-shared/utils';
import { computed, type ReadonlySignal } from '@preact/signals-core';

import { evalFilter, filterRefNames } from '../../core/filter/eval.js';
import { FilterTrait, filterTraitKey } from '../../core/filter/trait.js';
import { emptyFilterGroup } from '../../core/filter/utils.js';
import { PropertyBase } from '../../core/view-manager/property.js';
import {
  type SingleView,
  SingleViewBase,
} from '../../core/view-manager/single-view.js';
import type { ViewManager } from '../../core/view-manager/view-manager.js';
import type { ListViewData } from './define.js';

const LIST_VIEW_HIDDEN_PROPERTY_NAMES = new Set([
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
]);

export const materializeListColumns = (
  columns: ListColumnData[],
  propertyIds: string[]
) => {
  const needShow = new Set(propertyIds);
  const orderedColumns: ListColumnData[] = [];

  for (const column of columns) {
    if (needShow.has(column.id)) {
      orderedColumns.push(column);
      needShow.delete(column.id);
    }
  }
  for (const id of needShow) {
    orderedColumns.push({ id });
  }

  const unchanged =
    columns.length === orderedColumns.length &&
    columns.every((column, index) => {
      const nextColumn = orderedColumns[index];
      return (
        nextColumn &&
        column.id === nextColumn.id &&
        column.hide === nextColumn.hide
      );
    });

  return unchanged ? columns : orderedColumns;
};

export class ListSingleView extends SingleViewBase<ListViewData> {
  propertiesRaw$ = computed(() => {
    const needShow = new Set(this.dataSource.properties$.value);
    const result: string[] = [];
    this.data$.value?.columns.forEach(column => {
      if (needShow.has(column.id)) {
        result.push(column.id);
        needShow.delete(column.id);
      }
    });
    result.push(...needShow);
    return result.map(id => this.propertyGetOrCreate(id));
  });

  properties$ = computed(() => {
    return this.propertiesRaw$.value.filter(property => !property.hide$.value);
  });

  detailProperties$ = computed(() => {
    if (!this.showAdditionalFields$.value) {
      return [];
    }
    const titleColumn = this.mainProperties$.value.titleColumn;
    return this.properties$.value.filter(property => {
      if (property.id === titleColumn) {
        return false;
      }
      if (LIST_VIEW_HIDDEN_PROPERTY_NAMES.has(property.name$.value)) {
        return false;
      }
      return true;
    });
  });

  private readonly filter$ = computed(() => {
    return this.data$.value?.filter ?? emptyFilterGroup;
  });

  filterTrait = this.traitSet(
    filterTraitKey,
    new FilterTrait(this.filter$, this, {
      filterSet: filter => {
        this.dataUpdate(() => ({ filter }));
      },
    })
  );

  mainProperties$ = computed(() => {
    return (
      this.data$.value?.header ?? {
        titleColumn: this.propertiesRaw$.value.find(
          property => property.type$.value === 'title'
        )?.id,
      }
    );
  });

  readonly$ = computed(() => this.manager.readonly$.value);

  showAdditionalFields$ = computed(() => {
    return this.data$.value?.showAdditionalFields ?? true;
  });

  fieldLayout$ = computed(() => {
    return this.data$.value?.fieldLayout ?? 'aligned';
  });

  setAdditionalFieldsVisible(visible: boolean) {
    this.dataUpdate(() => ({ showAdditionalFields: visible }));
  }

  setFieldLayout(layout: 'inline' | 'aligned' | 'right') {
    this.dataUpdate(() => ({ fieldLayout: layout }));
  }

  override get type(): string {
    return this.data$.value?.mode ?? 'list';
  }

  isShow(rowId: string): boolean {
    if (this.filter$.value.conditions.length) {
      // Only the properties the filter refers to: reading every property
      // (title included) made the filtered rows recompute, and every row
      // re-render, on each keystroke in any row (999.18).
      const refs = filterRefNames(this.filter$.value);
      const rowMap = Object.fromEntries(
        this.propertiesRaw$.value
          .filter(property => refs.has(property.id))
          .map(property => [
            property.id,
            property.cellGetOrCreate(rowId).jsonValue$.value,
          ])
      );
      return evalFilter(this.filter$.value, rowMap);
    }
    return true;
  }

  propertyGetOrCreate(propertyId: string): ListProperty {
    return new ListProperty(this, propertyId);
  }

  readonly computedProperties$: ReadonlySignal<ListColumnData[]> = computed(
    () => {
      return this.propertiesRaw$.value.map(property => ({
        id: property.id,
        hide: property.hide$.value,
      }));
    }
  );

  private materializeColumns() {
    const data = this.data$.value;
    if (!data) {
      return;
    }
    const nextColumns = materializeListColumns(
      data.columns,
      this.dataSource.properties$.value
    );
    if (nextColumns === data.columns) {
      return;
    }
    this.dataUpdate(() => ({ columns: nextColumns }));
  }

  constructor(viewManager: ViewManager, viewId: string) {
    super(viewManager, viewId);
    queueMicrotask(() => {
      this.materializeColumns();
    });
  }
}

type ListColumnData = ListViewData['columns'][number];

export class ListProperty extends PropertyBase {
  hide$ = computed(() => this.viewData$.value?.hide ?? false);

  override hideSet(hide: boolean): void {
    this.viewDataUpdate(data => ({ ...data, hide }));
  }

  override move(position: InsertToPosition): void {
    this.listView.dataUpdate(() => {
      const columns = [...this.listView.computedProperties$.value];
      const columnIndex = columns.findIndex(column => column.id === this.id);
      if (columnIndex < 0) {
        return {};
      }
      const [column] = columns.splice(columnIndex, 1);
      if (!column) {
        return {};
      }
      columns.splice(insertPositionToIndex(position, columns), 0, column);
      return { columns };
    });
  }

  constructor(
    private readonly listView: ListSingleView,
    propertyId: string
  ) {
    super(listView as SingleView, propertyId);
  }

  viewDataUpdate(
    updater: (viewData: ListColumnData) => Partial<ListColumnData>
  ): void {
    this.listView.dataUpdate(data => ({
      ...data,
      columns: this.listView.computedProperties$.value.map(column =>
        column.id === this.id ? { ...column, ...updater(column) } : column
      ),
    }));
  }

  viewData$ = computed(() => {
    return this.listView.data$.value?.columns.find(
      column => column.id === this.id
    );
  });
}
