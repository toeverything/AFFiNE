import {
  insertPositionToIndex,
  type InsertToPosition,
} from '@blocksuite/affine-shared/utils';
import {
  computed,
  type ReadonlySignal,
  signal,
  effect,
} from '@preact/signals-core';

import type { GroupBy, GroupProperty } from '../common/types.js';
import type { TypeInstance } from '../logical/type.js';
import { createTraitKey } from '../traits/key.js';
import { computedLock } from '../utils/lock.js';
import type { Property } from '../view-manager/property.js';
import type { Row } from '../view-manager/row.js';
import type { SingleView } from '../view-manager/single-view.js';
import { defaultGroupBy } from './default.js';
import {
  getGroupByService,
  findGroupByConfigByName,
} from './matcher.js';
import type { GroupByConfig } from './types.js';

const RELATIVE_ASC = ['last30', 'last7', 'yesterday', 'today'];
const RELATIVE_DESC = [...RELATIVE_ASC].reverse();


function compareDateKeys(mode: string | undefined, asc: boolean) {
  return (a: string, b: string) => {
    if (mode === 'date-relative') {
      const order = asc ? RELATIVE_ASC : RELATIVE_DESC;
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      const na = Number(a);
      const nb = Number(b);
      const aNum = Number.isFinite(na);
      const bNum = Number.isFinite(nb);

      if (aNum && bNum) {
        return asc ? na - nb : nb - na;
      }

      if (aNum && idxB !== -1) return asc ? -1 : 1;
      if (bNum && idxA !== -1) return asc ? 1 : -1;

      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return asc ? 1 : -1;
      if (idxB !== -1) return asc ? -1 : 1;

      if (aNum) return asc ? -1 : 1;
      if (bNum) return asc ? 1 : -1;

      return asc ? a.localeCompare(b) : b.localeCompare(a);
    }

    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      return asc ? na - nb : nb - na;
    }
    return asc ? a.localeCompare(b) : b.localeCompare(a);
  };
}

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
    public readonly manager: GroupTrait,
  ) { }

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
}

export class GroupTrait {
  hideEmpty$ = signal<boolean>(true);
  sortAsc$ = signal<boolean>(true);
  constructor(
    private readonly groupBy$: ReadonlySignal<GroupBy | undefined>,
    public view: SingleView,
    private readonly ops: {
      groupBySet: (g: GroupBy | undefined) => void;
      sortGroup: (keys: string[]) => string[];
      sortRow: (groupKey: string, rows: Row[]) => Row[];
      changeGroupSort: (keys: string[]) => void;
      changeRowSort: (
        groupKeys: string[],
        groupKey: string,
        keys: string[],
      ) => void;
    },
  ) {
    effect(() => {
      const desc = this.groupBy$.value?.sort?.desc;
      if (desc != null) {
        this.sortAsc$.value = !desc;
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
        ? findGroupByConfigByName(this.view.manager.dataSource, groupBy.name) ??
        svc?.matcher.match(tType)
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
        .map(({ key, value }) => [key, new Group(key, value, info, this)]),
    );
    return { staticMap, groupInfo: info };
  });

  groupDataMap$ = computed(() => {
    const st = this.staticInfo$.value;
    if (!st) return;
    const { staticMap, groupInfo } = st;
    const map: Record<string, Group> = { ...staticMap };
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

      if (gi?.config.matchType.type === 'date') {
        ordered = [...Object.keys(map)].sort(
          compareDateKeys(gi.config.name, this.sortAsc$.value),
        );
      } else {
        ordered = this.ops.sortGroup(Object.keys(map));
      }
      return ordered
        .map(k => map[k])
        .filter(
          g =>
            g != null && (!this.hideEmpty$.value || g.rows.length > 0),
        );
    }),
    this.view.isLocked$,
  );

  setHideEmpty(v: boolean) {
    this.hideEmpty$.value = v;
  }
  setDateSortOrder(asc: boolean) {
    this.sortAsc$.value = asc;

    const gb = this.groupBy$.value;
    if (gb) {
      this.ops.groupBySet({ ...gb, sort: { desc: !asc } });
    }

    const gi = this.groupInfo$.value;
    if (!gi || !gi.config.name?.startsWith('date-')) return;

    const map = this.groupDataMap$.value;
    if (!map) return;

    const keys = Object.keys(map)
      .filter(k => k !== 'Ungroups')
      .sort(compareDateKeys(gi.config.name, asc));

    if (map['Ungroups']) keys.push('Ungroups');

    this.changeGroupSort(keys);
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
  }
  changeGroupMode(modeName: string) {
    const propId = this.property$.value?.id;
    if (!propId) return;
    this.ops.groupBySet({
      type: 'groupBy',
      columnId: propId,
      name: modeName,
      sort: { desc: !this.sortAsc$.value },
    });
  }

  changeGroup(columnId: string | undefined) {
    if (columnId == null) {
      this.ops.groupBySet(undefined);
      return;
    }
    const column = this.view.propertyGetOrCreate(columnId);
    const meta = this.view.manager.dataSource.propertyMetaGet(
      column.type$.value,
    );
    if (meta) {
      const gb = defaultGroupBy(
        this.view.manager.dataSource,
        meta,
        column.id,
        column.data$.value,
      );
      if (gb) {
        gb.sort = { desc: !this.sortAsc$.value };
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
  ids: string[],
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
