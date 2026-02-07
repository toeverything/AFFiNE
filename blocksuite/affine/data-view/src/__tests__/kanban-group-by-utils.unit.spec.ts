import { signal } from '@preact/signals-core';
import { describe, expect, it } from 'vitest';

import type { GroupBy } from '../core/common/types.js';
import type { DataSource } from '../core/data-source/base.js';
import { t } from '../core/logical/type-presets.js';
import type { PropertyMetaConfig } from '../core/property/property-config.js';
import { checkboxPropertyModelConfig } from '../property-presets/checkbox/define.js';
import { multiSelectPropertyModelConfig } from '../property-presets/multi-select/define.js';
import { selectPropertyModelConfig } from '../property-presets/select/define.js';
import { textPropertyModelConfig } from '../property-presets/text/define.js';
import {
  ensureKanbanGroupColumn,
  isKanbanGroupableProperty,
  pickKanbanGroupColumn,
  resolveKanbanGroupBy,
} from '../view-presets/kanban/group-by-utils.js';

type Column = {
  id: string;
  type: string;
  data?: Record<string, unknown>;
};

const immutableBooleanMeta = {
  type: 'immutable-boolean',
  config: {
    kanbanGroup: {
      enabled: true,
      mutable: false,
    },
    jsonValue: {
      type: () => t.boolean.instance(),
    },
  },
} as unknown as PropertyMetaConfig;

const createMockDataSource = (columns: Column[]): DataSource => {
  const properties$ = signal(columns.map(column => column.id));
  const typeById = new Map(columns.map(column => [column.id, column.type]));
  const dataById = new Map(
    columns.map(column => [
      column.id,
      column.data ?? ({} as Record<string, unknown>),
    ])
  );
  const services = new Map<unknown, unknown>();

  const metaByType = new Map<string, PropertyMetaConfig>([
    [
      checkboxPropertyModelConfig.type,
      {
        type: checkboxPropertyModelConfig.type,
        config: checkboxPropertyModelConfig.config,
      } as PropertyMetaConfig,
    ],
    [
      selectPropertyModelConfig.type,
      {
        type: selectPropertyModelConfig.type,
        config: selectPropertyModelConfig.config,
      } as PropertyMetaConfig,
    ],
    [
      multiSelectPropertyModelConfig.type,
      {
        type: multiSelectPropertyModelConfig.type,
        config: multiSelectPropertyModelConfig.config,
      } as PropertyMetaConfig,
    ],
    [
      textPropertyModelConfig.type,
      {
        type: textPropertyModelConfig.type,
        config: textPropertyModelConfig.config,
      } as PropertyMetaConfig,
    ],
    [immutableBooleanMeta.type, immutableBooleanMeta],
  ]);

  let autoColumnId = 0;

  const dataSource = {
    properties$,
    provider: {
      getAll: () => new Map(),
    },
    serviceGetOrCreate: (key: unknown, create: () => unknown) => {
      if (!services.has(key)) {
        services.set(key, create());
      }
      return services.get(key);
    },
    propertyTypeGet: (propertyId: string) => typeById.get(propertyId),
    propertyMetaGet: (type: string) => metaByType.get(type),
    propertyDataGet: (propertyId: string) => dataById.get(propertyId) ?? {},
    propertyDataTypeGet: (propertyId: string) => {
      const type = typeById.get(propertyId);
      if (!type) {
        return;
      }
      const meta = metaByType.get(type);
      if (!meta) {
        return;
      }
      return meta.config.jsonValue.type({
        data: dataById.get(propertyId) ?? {},
        dataSource: dataSource as DataSource,
      });
    },
    propertyAdd: (
      _position: unknown,
      ops?: {
        type?: string;
      }
    ) => {
      const type = ops?.type ?? selectPropertyModelConfig.type;
      const id = `auto-${++autoColumnId}`;
      const meta = metaByType.get(type);
      const data = meta?.config.propertyData.default() ?? {};

      typeById.set(id, type);
      dataById.set(id, data as Record<string, unknown>);
      properties$.value = [...properties$.value, id];
      return id;
    },
    propertyDataSet: (propertyId: string, data: Record<string, unknown>) => {
      dataById.set(propertyId, data);
    },
  } as unknown as DataSource;

  return dataSource;
};

describe('kanban group by utils', () => {
  it('allows only kanban-enabled property types to group', () => {
    const dataSource = createMockDataSource([
      { id: 'text', type: textPropertyModelConfig.type },
      { id: 'select', type: selectPropertyModelConfig.type },
      { id: 'multi-select', type: multiSelectPropertyModelConfig.type },
      { id: 'checkbox', type: checkboxPropertyModelConfig.type },
    ]);

    expect(isKanbanGroupableProperty(dataSource, 'text')).toBe(false);
    expect(isKanbanGroupableProperty(dataSource, 'select')).toBe(true);
    expect(isKanbanGroupableProperty(dataSource, 'multi-select')).toBe(true);
    expect(isKanbanGroupableProperty(dataSource, 'checkbox')).toBe(true);
  });

  it('prefers mutable group column over immutable ones', () => {
    const dataSource = createMockDataSource([
      {
        id: 'immutable-bool',
        type: 'immutable-boolean',
      },
      {
        id: 'checkbox',
        type: checkboxPropertyModelConfig.type,
      },
    ]);

    expect(pickKanbanGroupColumn(dataSource)).toBe('checkbox');
  });

  it('creates default status select column when no groupable column exists', () => {
    const dataSource = createMockDataSource([
      {
        id: 'text',
        type: textPropertyModelConfig.type,
      },
    ]);

    const statusColumnId = ensureKanbanGroupColumn(dataSource);

    expect(statusColumnId).toBeTruthy();
    expect(dataSource.propertyTypeGet(statusColumnId!)).toBe(
      selectPropertyModelConfig.type
    );
    const options =
      (
        dataSource.propertyDataGet(statusColumnId!) as {
          options?: { value: string }[];
        }
      ).options ?? [];
    expect(options.map(option => option.value)).toEqual([
      'Todo',
      'In Progress',
      'Done',
    ]);
  });

  it('defaults hideEmpty to false for kanban grouping', () => {
    const dataSource = createMockDataSource([
      {
        id: 'checkbox',
        type: checkboxPropertyModelConfig.type,
      },
    ]);

    const next = resolveKanbanGroupBy(dataSource);
    expect(next?.columnId).toBe('checkbox');
    expect(next?.hideEmpty).toBe(false);
    expect(next?.name).toBe('boolean');
  });

  it('preserves sort and explicit hideEmpty when resolving groupBy', () => {
    const dataSource = createMockDataSource([
      {
        id: 'checkbox',
        type: checkboxPropertyModelConfig.type,
      },
    ]);
    const current: GroupBy = {
      type: 'groupBy',
      columnId: 'checkbox',
      name: 'boolean',
      sort: { desc: true },
      hideEmpty: true,
    };

    const next = resolveKanbanGroupBy(dataSource, current);

    expect(next?.columnId).toBe('checkbox');
    expect(next?.sort).toEqual({ desc: true });
    expect(next?.hideEmpty).toBe(true);
  });

  it('replaces current non-groupable column with a valid kanban column', () => {
    const dataSource = createMockDataSource([
      { id: 'text', type: textPropertyModelConfig.type },
      { id: 'checkbox', type: checkboxPropertyModelConfig.type },
    ]);

    const next = resolveKanbanGroupBy(dataSource, {
      type: 'groupBy',
      columnId: 'text',
      name: 'text',
    });

    expect(next?.columnId).toBe('checkbox');
    expect(next?.name).toBe('boolean');
    expect(next?.hideEmpty).toBe(false);
  });
});
