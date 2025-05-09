import {
  insertPositionToIndex,
  type InsertToPosition,
} from '@blocksuite/affine-shared/utils';
import { computed, type ReadonlySignal } from '@preact/signals-core';

import type { GroupBy, GroupProperty } from '../common/types.js';
import type { TypeInstance } from '../logical/type.js';
import { createTraitKey } from '../traits/key.js';
import { computedLock } from '../utils/lock.js';
import type { Property } from '../view-manager/property.js';
import type { Row } from '../view-manager/row.js';
import type { SingleView } from '../view-manager/single-view.js';
import { defaultGroupBy } from './default.js';
import { groupByMatcher } from './matcher.js';
export type GroupData = {
  manager: GroupTrait;
  property: Property;
  key: string;
  name: string;
  type: TypeInstance;
  value: unknown;
  rows: Row[];
};

export class GroupTrait {
  config$ = computed(() => {
    const groupBy = this.groupBy$.value;
    if (!groupBy) {
      return;
    }
    const result = groupByMatcher.find(v => v.data.name === groupBy.name);
    if (!result) {
      return;
    }
    return result.data;
  });

  property$ = computed(() => {
    const groupBy = this.groupBy$.value;
    if (!groupBy) {
      return;
    }
    return this.view.propertyGetOrCreate(groupBy.columnId);
  });

  staticGroupDataMap$ = computed<
    Record<string, Omit<GroupData, 'rows'>> | undefined
  >(() => {
    const config = this.config$.value;
    const property = this.property$.value;
    const tType = property?.dataType$.value;
    if (!config || !tType || !property) {
      return;
    }
    return Object.fromEntries(
      config.defaultKeys(tType).map(({ key, value }) => [
        key,
        {
          key,
          property,
          name: config.groupName(tType, value),
          manager: this,
          type: tType,
          value,
        },
      ])
    );
  });

  groupDataMap$ = computed<Record<string, GroupData> | undefined>(() => {
    const staticGroupMap = this.staticGroupDataMap$.value;
    const config = this.config$.value;
    const groupBy = this.groupBy$.value;
    const property = this.property$.value;
    const tType = property?.dataType$.value;
    if (!staticGroupMap || !config || !groupBy || !tType || !property) {
      return;
    }
    const groupMap: Record<string, GroupData> = Object.fromEntries(
      Object.entries(staticGroupMap).map(([k, v]) => [k, { ...v, rows: [] }])
    );
    this.view.rows$.value.forEach(row => {
      const value = this.view.cellGetOrCreate(row.rowId, groupBy.columnId)
        .jsonValue$.value;
      const keys = config.valuesGroup(value, tType);
      keys.forEach(({ key, value }) => {
        if (!groupMap[key]) {
          groupMap[key] = {
            key,
            property: property,
            name: config.groupName(tType, value),
            manager: this,
            value,
            rows: [],
            type: tType,
          };
        }
        groupMap[key].rows.push(row);
      });
    });
    return groupMap;
  });

  groupsDataList$ = computedLock(
    computed(() => {
      const groupMap = this.groupDataMap$.value;
      if (!groupMap) {
        return;
      }
      const sortedGroup = this.ops.sortGroup(Object.keys(groupMap));
      sortedGroup.forEach(key => {
        if (!groupMap[key]) return;
        groupMap[key].rows = this.ops.sortRow(key, groupMap[key].rows);
      });
      return sortedGroup
        .map(key => groupMap[key])
        .filter((v): v is GroupData => v != null);
    }),
    this.view.isLocked$
  );

  updateData = (data: NonNullable<unknown>) => {
    const propertyId = this.propertyId;
    if (!propertyId) {
      return;
    }
    this.view.propertyGetOrCreate(propertyId).dataUpdate(() => data);
  };

  get addGroup() {
    const type = this.property$.value?.type$.value;
    if (!type) {
      return;
    }
    return this.view.manager.dataSource.propertyMetaGet(type)?.config.addGroup;
  }

  get propertyId() {
    return this.groupBy$.value?.columnId;
  }

  constructor(
    private readonly groupBy$: ReadonlySignal<GroupBy | undefined>,
    public view: SingleView,
    private readonly ops: {
      groupBySet: (groupBy: GroupBy | undefined) => void;
      sortGroup: (keys: string[]) => string[];
      sortRow: (groupKey: string, rows: Row[]) => Row[];
      changeGroupSort: (keys: string[]) => void;
      changeRowSort: (
        groupKeys: string[],
        groupKey: string,
        keys: string[]
      ) => void;
    }
  ) {}

  addToGroup(rowId: string, key: string) {
    const groupMap = this.groupDataMap$.value;
    const propertyId = this.propertyId;
    if (!groupMap || !propertyId) {
      return;
    }
    const addTo = this.config$.value?.addToGroup ?? (value => value);
    const v = groupMap[key]?.value;
    if (v != null) {
      const newValue = addTo(
        v,
        this.view.cellGetOrCreate(rowId, propertyId).jsonValue$.value
      );
      this.view.cellGetOrCreate(rowId, propertyId).valueSet(newValue);
    }
  }

  changeCardSort(groupKey: string, cardIds: string[]) {
    const groups = this.groupsDataList$.value;
    if (!groups) {
      return;
    }
    this.ops.changeRowSort(
      groups.map(v => v.key),
      groupKey,
      cardIds
    );
  }

  changeGroup(columnId: string | undefined) {
    if (columnId == null) {
      this.ops.groupBySet(undefined);
      return;
    }
    const column = this.view.propertyGetOrCreate(columnId);
    const propertyMeta = this.view.manager.dataSource.propertyMetaGet(
      column.type$.value
    );
    if (propertyMeta) {
      this.ops.groupBySet(
        defaultGroupBy(
          this.view.manager.dataSource,
          propertyMeta,
          column.id,
          column.data$.value
        )
      );
    }
  }

  changeGroupSort(keys: string[]) {
    this.ops.changeGroupSort(keys);
  }

  defaultGroupProperty(key: string): GroupProperty {
    return {
      key,
      hide: false,
      manuallyCardSort: [],
    };
  }

  moveCardTo(
    rowId: string,
    fromGroupKey: string | undefined,
    toGroupKey: string,
    position: InsertToPosition
  ) {
    const groupMap = this.groupDataMap$.value;
    if (!groupMap) {
      return;
    }
    if (fromGroupKey !== toGroupKey) {
      const propertyId = this.propertyId;
      if (!propertyId) {
        return;
      }
      const remove = this.config$.value?.removeFromGroup ?? (() => null);
      const group = fromGroupKey != null ? groupMap[fromGroupKey] : undefined;
      let newValue: unknown = null;
      if (group) {
        newValue = remove(
          group.value,
          this.view.cellGetOrCreate(rowId, propertyId).jsonValue$.value
        );
      }
      const addTo = this.config$.value?.addToGroup ?? (value => value);
      newValue = addTo(groupMap[toGroupKey]?.value ?? null, newValue);
      this.view.cellGetOrCreate(rowId, propertyId).jsonValueSet(newValue);
    }
    const rows =
      groupMap[toGroupKey]?.rows
        .filter(row => row.rowId !== rowId)
        .map(row => row.rowId) ?? [];
    const index = insertPositionToIndex(position, rows, row => row);
    rows.splice(index, 0, rowId);
    this.changeCardSort(toGroupKey, rows);
  }

  moveGroupTo(groupKey: string, position: InsertToPosition) {
    const groups = this.groupsDataList$.value;
    if (!groups) {
      return;
    }
    const keys = groups.map(v => v.key);
    keys.splice(
      keys.findIndex(key => key === groupKey),
      1
    );
    const index = insertPositionToIndex(position, keys, key => key);
    keys.splice(index, 0, groupKey);
    this.changeGroupSort(keys);
  }

  removeFromGroup(rowId: string, key: string) {
    const groupMap = this.groupDataMap$.value;
    if (!groupMap) {
      return;
    }
    const propertyId = this.propertyId;
    if (!propertyId) {
      return;
    }
    const remove = this.config$.value?.removeFromGroup ?? (() => undefined);
    const newValue = remove(
      groupMap[key]?.value ?? null,
      this.view.cellGetOrCreate(rowId, propertyId).jsonValue$.value
    );
    this.view.cellGetOrCreate(rowId, propertyId).valueSet(newValue);
  }

  updateValue(rows: string[], value: unknown) {
    const propertyId = this.propertyId;
    if (!propertyId) {
      return;
    }
    rows.forEach(rowId => {
      this.view.cellGetOrCreate(rowId, propertyId).jsonValueSet(value);
    });
  }
}

export const groupTraitKey = createTraitKey<GroupTrait>('group');

export const sortByManually = <T>(
  arr: T[],
  getId: (v: T) => string,
  ids: string[]
) => {
  const map = new Map(arr.map(v => [getId(v), v]));
  const result: T[] = [];
  for (const id of ids) {
    const value = map.get(id);
    if (value) {
      map.delete(id);
      result.push(value);
    }
  }
  result.push(...map.values());
  return result;
};
