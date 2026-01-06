import {
  insertPositionToIndex,
  type InsertToPosition,
} from '@blocksuite/affine-shared/utils';
import {
  computed,
  effect,
  type ReadonlySignal,
  signal,
} from '@preact/signals-core';

import type { GroupBy, GroupProperty } from '../common/types.js';
import type { TypeInstance } from '../logical/type.js';
import { createTraitKey } from '../traits/key.js';
import { computedLock } from '../utils/lock.js';
import type { Property } from '../view-manager/property.js';
import type { Row } from '../view-manager/row.js';
import type { SingleView } from '../view-manager/single-view.js';
import { compareDateKeys } from './compare-date-keys.js';
import { defaultGroupBy } from './default.js';
import { findGroupByConfigByName, getGroupByService } from './matcher.js';
// Test
import type { GroupByConfig } from './types.js';

export type GroupInfo<
  RawValue = unknown,
  JsonValue = unknown,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = {
  config: GroupByConfig;
  property: Property<RawValue, JsonValue, Data>;
  tType: TypeInstance;
};

export class Group<
  RawValue = unknown,
  JsonValue = unknown,
  Data extends Record<string, unknown> = Record<string, unknown>,
> {
  rows: Row[] = [];

  constructor(
    public readonly key: string,
    public readonly value: JsonValue,
    private readonly groupInfo: GroupInfo<RawValue, JsonValue, Data>,
    public readonly manager: GroupTrait
  ) {}

  get property() {
    return this.groupInfo.property;
  }
  name$ = computed(() => {
    const type = this.property.dataType$.value;
    return type ? this.groupInfo.config.groupName(type, this.value) : '';
  });
  private get config() {
    return this.groupInfo.config;
  }
  get tType() {
    return this.groupInfo.tType;
  }
  get view() {
    return this.config.view;
  }

  hide$ = computed(() => {
    const groupHide =
      this.manager.groupPropertiesMap$.value[this.key]?.hide ?? false;
    const emptyHidden = this.manager.hideEmpty$.value && this.rows.length === 0;
    return groupHide || emptyHidden;
  });

  hideSet(hide: boolean) {
    this.manager.setGroupHide(this.key, hide);
  }
}

function hasGroupProperties(
  data: unknown
): data is { groupProperties?: GroupProperty[] } {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  if (!('groupProperties' in data)) {
    return false;
  }
  const value = (data as { groupProperties?: unknown }).groupProperties;
  return value === undefined || Array.isArray(value);
}

export class GroupTrait {
  hideEmpty$ = signal<boolean>(true);
  sortAsc$ = signal<boolean>(true);

  groupProperties$ = computed(() => {
    const data = this.view.data$.value;
    return hasGroupProperties(data) ? (data.groupProperties ?? []) : [];
  });

  groupPropertiesMap$ = computed(() => {
    const map: Record<string, GroupProperty> = {};
    this.groupProperties$.value.forEach(g => {
      map[g.key] = g;
    });
    return map;
  });

  /**
   * Synchronize sortAsc$ with the GroupBy sort descriptor
   */
  constructor(
    private readonly groupBy$: ReadonlySignal<GroupBy | undefined>,
    public view: SingleView,
    private readonly ops: {
      groupBySet: (g: GroupBy | undefined) => void;
      sortGroup: (keys: string[], asc?: boolean) => string[];
      sortRow: (groupKey: string, rows: Row[]) => Row[];
      changeGroupSort: (keys: string[]) => void;
      changeRowSort: (
        groupKeys: string[],
        groupKey: string,
        keys: string[]
      ) => void;
      changeGroupHide?: (key: string, hide: boolean) => void;
    }
  ) {
    effect(() => {
      const desc = this.groupBy$.value?.sort?.desc;
      if (desc != null && this.sortAsc$.value === desc) {
        this.sortAsc$.value = !desc;
      }
    });

    // Sync hideEmpty state with GroupBy data
    effect(() => {
      const hide = this.groupBy$.value?.hideEmpty;
      if (hide != null && this.hideEmpty$.value !== hide) {
        this.hideEmpty$.value = hide;
      }
    });
  }

  groupInfo$ = computed<GroupInfo | undefined>(() => {
    const groupBy = this.groupBy$.value;
    if (!groupBy) return;

    const property = this.view.propertyGetOrCreate(groupBy.columnId);
    if (!property) return;

    const tType = property.dataType$.value;
    if (!tType) return;

    const svc = getGroupByService(this.view.manager.dataSource);
    const res =
      groupBy.name != null
        ? (findGroupByConfigByName(
            this.view.manager.dataSource,
            groupBy.name
          ) ?? svc?.matcher.match(tType))
        : svc?.matcher.match(tType);

    if (!res) return;
    return { config: res, property, tType };
  });

  staticInfo$ = computed(() => {
    const info = this.groupInfo$.value;
    if (!info) return;
    const staticMap = Object.fromEntries(
      info.config
        .defaultKeys(info.tType)
        .map(({ key, value }) => [key, new Group(key, value, info, this)])
    );
    return { staticMap, groupInfo: info };
  });

  groupDataMap$ = computed(() => {
    const si = this.staticInfo$.value;
    if (!si) return;
    const { staticMap, groupInfo } = si;
    // Create fresh Group instances with empty rows arrays
    const map: Record<string, Group> = {};
    Object.entries(staticMap).forEach(([key, group]) => {
      map[key] = new Group(key, group.value, groupInfo, this);
    });
    // Assign rows to their respective groups
    this.view.rows$.value.forEach(row => {
      const cell = this.view.cellGetOrCreate(row.rowId, groupInfo.property.id);
      const jv = cell.jsonValue$.value;
      const keys = groupInfo.config.valuesGroup(jv, groupInfo.tType);
      keys.forEach(({ key, value }) => {
        if (!map[key]) map[key] = new Group(key, value, groupInfo, this);
        map[key].rows.push(row);
      });
    });
    return map;
  });

  groupsDataList$ = computedLock(
    computed(() => {
      const map = this.groupDataMap$.value;
      if (!map) return;

      const gi = this.groupInfo$.value;
      let ordered: string[];

      if (gi?.config.matchType.name === 'Date') {
        ordered = Object.keys(map).sort(
          compareDateKeys(gi.config.name, this.sortAsc$.value)
        );
      } else {
        ordered = this.ops.sortGroup(Object.keys(map), this.sortAsc$.value);
      }

      return ordered
        .map(k => map[k])
        .filter(
          (g): g is Group =>
            !!g &&
            !this.isGroupHidden(g.key) &&
            (!this.hideEmpty$.value || g.rows.length > 0)
        );
    }),
    this.view.isLocked$
  );

  /**
   * Computed list of groups including hidden ones, used by settings UI.
   */
  groupsDataListAll$ = computedLock(
    computed(() => {
      const map = this.groupDataMap$.value;
      const info = this.groupInfo$.value;
      if (!map || !info) return;

      let orderedKeys: string[];
      if (info.config.matchType.name === 'Date') {
        orderedKeys = Object.keys(map).sort(
          compareDateKeys(info.config.name, this.sortAsc$.value)
        );
      } else {
        orderedKeys = this.ops.sortGroup(Object.keys(map), this.sortAsc$.value);
      }

      const visible: Group[] = [];
      const hidden: Group[] = [];
      orderedKeys
        .map(key => map[key])
        .filter((g): g is Group => g != null)
        .forEach(g => {
          if (g.hide$.value) {
            hidden.push(g);
          } else {
            visible.push(g);
          }
        });
      return [...visible, ...hidden];
    }),
    this.view.isLocked$
  );

  /** Whether all groups are currently hidden */
  allHidden$ = computed(() => {
    const map = this.groupDataMap$.value;
    if (!map) return false;
    return Object.keys(map).every(key => this.isGroupHidden(key));
  });

  /**
   * Toggle hiding of empty groups.
   */

  setHideEmpty(value: boolean) {
    this.hideEmpty$.value = value;
    const gb = this.groupBy$.value;
    if (gb) {
      this.ops.groupBySet({ ...gb, hideEmpty: value });
    }
  }

  isGroupHidden(key: string): boolean {
    return this.groupPropertiesMap$.value[key]?.hide ?? false;
  }

  setGroupHide(key: string, hide: boolean) {
    this.ops.changeGroupHide?.(key, hide);
  }

  /**
   * Set sort order for date groupings and update GroupBy sort descriptor.
   */
  setDateSortOrder(asc: boolean) {
    this.sortAsc$.value = asc;

    const gb = this.groupBy$.value;
    if (gb) {
      this.ops.groupBySet({
        ...gb,
        sort: { desc: !asc },
        hideEmpty: gb.hideEmpty,
      });
    }
  }

  addToGroup(rowId: string, key: string) {
    const groupMap = this.groupDataMap$.value;
    const groupInfo = this.groupInfo$.value;
    if (!groupMap || !groupInfo) {
      return;
    }
    const addTo = groupInfo.config.addToGroup;
    if (addTo === false) {
      return;
    }
    const v = groupMap[key]?.value;
    if (v != null) {
      const newValue = addTo(
        v,
        this.view.cellGetOrCreate(rowId, groupInfo.property.id).jsonValue$.value
      );
      this.view
        .cellGetOrCreate(rowId, groupInfo.property.id)
        .valueSet(newValue);
    }
    const map = this.groupDataMap$.value;
    const info = this.groupInfo$.value;
    if (!map || !info) return;

    const addFn = info.config.addToGroup;
    if (addFn === false) return;

    const group = map[key];
    if (!group) return;

    const current = group.value;
    // Handle both null and non-null values to ensure proper group assignment
    const newVal = addFn(
      current,
      this.view.cellGetOrCreate(rowId, info.property.id).jsonValue$.value
    );
    this.view.cellGetOrCreate(rowId, info.property.id).valueSet(newVal);
  }
  changeGroupMode(modeName: string) {
    const propId = this.property$.value?.id;
    if (!propId) return;
    this.ops.groupBySet({
      type: 'groupBy',
      columnId: propId,
      name: modeName,
      sort: { desc: !this.sortAsc$.value },
      hideEmpty: this.hideEmpty$.value,
    });
  }

  changeGroup(columnId: string | undefined) {
    if (columnId == null) {
      this.ops.groupBySet(undefined);
      return;
    }
    const column = this.view.propertyGetOrCreate(columnId);
    const meta = this.view.manager.dataSource.propertyMetaGet(
      column.type$.value
    );
    if (meta) {
      const gb = defaultGroupBy(
        this.view.manager.dataSource,
        meta,
        column.id,
        column.data$.value
      );
      if (gb) {
        gb.sort = { desc: !this.sortAsc$.value };
        gb.hideEmpty = this.hideEmpty$.value;
      }
      this.ops.groupBySet(gb);
    }
  }

  property$ = computed(() => this.groupInfo$.value?.property);

  get addGroup() {
    return this.property$.value?.meta$.value?.config.addGroup;
  }

  updateData = (data: NonNullable<unknown>) => {
    const prop = this.property$.value;
    if (!prop) return;
    this.view.propertyGetOrCreate(prop.id).dataUpdate(() => data);
  };

  changeGroupSort(keys: string[]) {
    this.ops.changeGroupSort(keys);
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
      const propertyId = this.property$.value?.id;
      if (!propertyId) {
        return;
      }
      const remove =
        this.groupInfo$.value?.config.removeFromGroup ?? (() => null);
      const group = fromGroupKey != null ? groupMap[fromGroupKey] : undefined;
      let newValue: unknown = null;
      if (group) {
        newValue = remove(
          group.value,
          this.view.cellGetOrCreate(rowId, propertyId).jsonValue$.value
        );
      }
      const addTo = this.groupInfo$.value?.config.addToGroup;
      if (addTo === false || addTo == null) {
        return;
      }
      newValue = addTo(groupMap[toGroupKey]?.value ?? null, newValue);
      this.view.cellGetOrCreate(rowId, propertyId).jsonValueSet(newValue);
    }
    const rows =
      groupMap[toGroupKey]?.rows
        .filter(row => row.rowId !== rowId)
        .map(row => row.rowId) ?? [];
    const index = insertPositionToIndex(position, rows, row => row);
    rows.splice(index, 0, rowId);
    const groupKeys = Object.keys(groupMap);
    this.ops.changeRowSort(groupKeys, toGroupKey, rows);
  }

  moveGroupTo(groupKey: string, position: InsertToPosition) {
    const groups = this.groupsDataList$.value;
    if (!groups) {
      return;
    }
    const keys = groups.map(v => v!.key);
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
    const propertyId = this.property$.value?.id;
    if (!propertyId) {
      return;
    }
    const remove =
      this.groupInfo$.value?.config.removeFromGroup ?? (() => undefined);
    const newValue = remove(
      groupMap[key]?.value ?? null,
      this.view.cellGetOrCreate(rowId, propertyId).jsonValue$.value
    );
    this.view.cellGetOrCreate(rowId, propertyId).valueSet(newValue);
  }

  updateValue(rows: string[], value: unknown) {
    const propertyId = this.property$.value?.id;
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
