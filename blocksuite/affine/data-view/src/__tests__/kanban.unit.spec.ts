import { signal } from '@preact/signals-core';
import { describe, expect, it, vi } from 'vitest';

import type { GroupBy } from '../core/common/types.js';
import type { DataSource } from '../core/data-source/base.js';
import { DetailSelection } from '../core/detail/selection.js';
import { groupByMatchers } from '../core/group-by/define.js';
import { t } from '../core/logical/type-presets.js';
import type { DataViewCellLifeCycle } from '../core/property/index.js';
import { checkboxPropertyModelConfig } from '../property-presets/checkbox/define.js';
import { multiSelectPropertyModelConfig } from '../property-presets/multi-select/define.js';
import { selectPropertyModelConfig } from '../property-presets/select/define.js';
import { textPropertyModelConfig } from '../property-presets/text/define.js';
import {
  canGroupable,
  ensureKanbanGroupColumn,
  pickKanbanGroupColumn,
  resolveKanbanGroupBy,
} from '../view-presets/kanban/group-by-utils.js';
import { materializeKanbanColumns } from '../view-presets/kanban/kanban-view-manager.js';
import type { KanbanCard } from '../view-presets/kanban/pc/card.js';
import { KanbanDragController } from '../view-presets/kanban/pc/controller/drag.js';
import type { KanbanGroup } from '../view-presets/kanban/pc/group.js';

type Column = {
  id: string;
  type: string;
  data?: Record<string, unknown>;
};

type TestPropertyMeta = {
  type: string;
  config: {
    kanbanGroup?: {
      enabled: boolean;
      mutable?: boolean;
    };
    propertyData: {
      default: () => Record<string, unknown>;
    };
    jsonValue: {
      type: (options: {
        data: Record<string, unknown>;
        dataSource: DataSource;
      }) => unknown;
    };
  };
};

type MockDataSource = {
  properties$: ReturnType<typeof signal<string[]>>;
  provider: {
    getAll: () => Map<unknown, unknown>;
  };
  serviceGetOrCreate: (key: unknown, create: () => unknown) => unknown;
  propertyTypeGet: (propertyId: string) => string | undefined;
  propertyMetaGet: (type: string) => TestPropertyMeta | undefined;
  propertyDataGet: (propertyId: string) => Record<string, unknown>;
  propertyDataTypeGet: (propertyId: string) => unknown;
  propertyAdd: (
    _position: unknown,
    ops?: {
      type?: string;
    }
  ) => string;
  propertyDataSet: (propertyId: string, data: Record<string, unknown>) => void;
};

const asDataSource = (dataSource: object): DataSource =>
  dataSource as DataSource;

const toTestMeta = <TData extends Record<string, unknown>>(
  type: string,
  config: {
    kanbanGroup?: {
      enabled: boolean;
      mutable?: boolean;
    };
    propertyData: {
      default: () => TData;
    };
    jsonValue: {
      type: (options: { data: TData; dataSource: DataSource }) => unknown;
    };
  }
): TestPropertyMeta => ({
  type,
  config: {
    kanbanGroup: config.kanbanGroup,
    propertyData: {
      default: () => config.propertyData.default(),
    },
    jsonValue: {
      type: ({ data, dataSource }) =>
        config.jsonValue.type({
          data: data as TData,
          dataSource,
        }),
    },
  },
});

const immutableBooleanMeta = toTestMeta('immutable-boolean', {
  ...checkboxPropertyModelConfig.config,
  kanbanGroup: {
    enabled: true,
    mutable: false,
  },
});

const createMockDataSource = (columns: Column[]): MockDataSource => {
  const properties$ = signal(columns.map(column => column.id));
  const typeById = new Map(columns.map(column => [column.id, column.type]));
  const dataById = new Map(
    columns.map(column => [column.id, column.data ?? {}])
  );
  const services = new Map<unknown, unknown>();

  const metaEntries: Array<[string, TestPropertyMeta]> = [
    [
      checkboxPropertyModelConfig.type,
      toTestMeta(
        checkboxPropertyModelConfig.type,
        checkboxPropertyModelConfig.config
      ),
    ],
    [
      selectPropertyModelConfig.type,
      toTestMeta(
        selectPropertyModelConfig.type,
        selectPropertyModelConfig.config
      ),
    ],
    [
      multiSelectPropertyModelConfig.type,
      toTestMeta(
        multiSelectPropertyModelConfig.type,
        multiSelectPropertyModelConfig.config
      ),
    ],
    [
      textPropertyModelConfig.type,
      toTestMeta(textPropertyModelConfig.type, textPropertyModelConfig.config),
    ],
    [immutableBooleanMeta.type, immutableBooleanMeta],
  ];
  const metaByType = new Map(metaEntries);

  const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value != null
      ? (value as Record<string, unknown>)
      : {};

  let autoColumnId = 0;

  const dataSource = {
    properties$,
    provider: {
      getAll: () => new Map<unknown, unknown>(),
    },
    serviceGetOrCreate: (key: unknown, create: () => unknown) => {
      if (!services.has(key)) {
        services.set(key, create());
      }
      return services.get(key);
    },
    propertyTypeGet: (propertyId: string) => typeById.get(propertyId),
    propertyMetaGet: (type: string) => metaByType.get(type),
    propertyDataGet: (propertyId: string) => asRecord(dataById.get(propertyId)),
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
        data: asRecord(dataById.get(propertyId)),
        dataSource: asDataSource(dataSource),
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
      dataById.set(id, data);
      properties$.value = [...properties$.value, id];
      return id;
    },
    propertyDataSet: (propertyId: string, data: Record<string, unknown>) => {
      dataById.set(propertyId, data);
    },
  };

  return dataSource;
};

const createDragController = () => {
  type DragLogic = ConstructorParameters<typeof KanbanDragController>[0];
  return new KanbanDragController({} as DragLogic);
};

describe('kanban', () => {
  describe('group-by define', () => {
    it('boolean group should not include ungroup bucket', () => {
      const booleanGroup = groupByMatchers.find(
        group => group.name === 'boolean'
      );
      expect(booleanGroup).toBeDefined();

      const keys = booleanGroup!
        .defaultKeys(t.boolean.instance())
        .map(group => group.key);

      expect(keys).toEqual(['true', 'false']);
    });

    it('boolean group should fallback invalid values to false bucket', () => {
      const booleanGroup = groupByMatchers.find(
        group => group.name === 'boolean'
      );
      expect(booleanGroup).toBeDefined();

      const groups = booleanGroup!.valuesGroup(undefined, t.boolean.instance());
      expect(groups).toEqual([{ key: 'false', value: false }]);
    });
  });

  describe('columns materialization', () => {
    it('appends missing properties while preserving existing order and state', () => {
      const columns = [{ id: 'status', hide: true }, { id: 'title' }];

      const next = materializeKanbanColumns(columns, [
        'title',
        'status',
        'date',
      ]);

      expect(next).toEqual([
        { id: 'status', hide: true },
        { id: 'title' },
        { id: 'date' },
      ]);
    });

    it('drops stale columns that no longer exist in data source', () => {
      const columns = [{ id: 'title' }, { id: 'removed', hide: true }];

      const next = materializeKanbanColumns(columns, ['title']);

      expect(next).toEqual([{ id: 'title' }]);
    });

    it('returns original reference when columns are already materialized', () => {
      const columns = [{ id: 'title' }, { id: 'status', hide: true }];

      const next = materializeKanbanColumns(columns, ['title', 'status']);

      expect(next).toBe(columns);
    });
  });

  describe('drag indicator', () => {
    it('shows drop preview when insert position exists', () => {
      const controller = createDragController();
      const position = {
        group: {} as KanbanGroup,
        position: 'end' as const,
      };
      controller.getInsertPosition = vi.fn().mockReturnValue(position);

      const displaySpy = vi.spyOn(controller.dropPreview, 'display');
      const removeSpy = vi.spyOn(controller.dropPreview, 'remove');

      const result = controller.showIndicator({} as MouseEvent, undefined);

      expect(result).toBe(position);
      expect(displaySpy).toHaveBeenCalledWith(
        position.group,
        undefined,
        undefined
      );
      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('removes drop preview when insert position does not exist', () => {
      const controller = createDragController();
      controller.getInsertPosition = vi.fn().mockReturnValue(undefined);

      const displaySpy = vi.spyOn(controller.dropPreview, 'display');
      const removeSpy = vi.spyOn(controller.dropPreview, 'remove');

      const result = controller.showIndicator({} as MouseEvent, undefined);

      expect(result).toBeUndefined();
      expect(displaySpy).not.toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalledOnce();
    });

    it('forwards hovered card to drop preview for precise insertion cursor', () => {
      const controller = createDragController();
      const hoveredCard = document.createElement(
        'affine-data-view-kanban-card'
      ) as KanbanCard;
      const positionCard = document.createElement(
        'affine-data-view-kanban-card'
      ) as KanbanCard;
      const position = {
        group: {} as KanbanGroup,
        card: positionCard,
        position: { before: true, id: 'card-id' } as const,
      };
      controller.getInsertPosition = vi.fn().mockReturnValue(position);

      const displaySpy = vi.spyOn(controller.dropPreview, 'display');

      controller.showIndicator({} as MouseEvent, hoveredCard);

      expect(displaySpy).toHaveBeenCalledWith(
        position.group,
        hoveredCard,
        position.card
      );
    });
  });

  describe('group-by utils', () => {
    it('allows only kanban-enabled property types to group', () => {
      const dataSource = createMockDataSource([
        { id: 'text', type: textPropertyModelConfig.type },
        { id: 'select', type: selectPropertyModelConfig.type },
        { id: 'multi-select', type: multiSelectPropertyModelConfig.type },
        { id: 'checkbox', type: checkboxPropertyModelConfig.type },
      ]);

      expect(canGroupable(asDataSource(dataSource), 'text')).toBe(false);
      expect(canGroupable(asDataSource(dataSource), 'select')).toBe(true);
      expect(canGroupable(asDataSource(dataSource), 'multi-select')).toBe(true);
      expect(canGroupable(asDataSource(dataSource), 'checkbox')).toBe(true);
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

      expect(pickKanbanGroupColumn(asDataSource(dataSource))).toBe('checkbox');
    });

    it('creates default status select column when no groupable column exists', () => {
      const dataSource = createMockDataSource([
        {
          id: 'text',
          type: textPropertyModelConfig.type,
        },
      ]);

      const statusColumnId = ensureKanbanGroupColumn(asDataSource(dataSource));

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

    it('defaults hideEmpty to true for non-option groups', () => {
      const dataSource = createMockDataSource([
        {
          id: 'checkbox',
          type: checkboxPropertyModelConfig.type,
        },
      ]);

      const next = resolveKanbanGroupBy(asDataSource(dataSource));
      expect(next?.columnId).toBe('checkbox');
      expect(next?.hideEmpty).toBe(true);
      expect(next?.name).toBe('boolean');
    });

    it('defaults hideEmpty to false for select grouping', () => {
      const dataSource = createMockDataSource([
        {
          id: 'select',
          type: selectPropertyModelConfig.type,
        },
      ]);

      const next = resolveKanbanGroupBy(asDataSource(dataSource));
      expect(next?.columnId).toBe('select');
      expect(next?.hideEmpty).toBe(false);
      expect(next?.name).toBe('select');
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

      const next = resolveKanbanGroupBy(asDataSource(dataSource), current);

      expect(next?.columnId).toBe('checkbox');
      expect(next?.sort).toEqual({ desc: true });
      expect(next?.hideEmpty).toBe(true);
    });

    it('replaces current non-groupable column with a valid kanban column', () => {
      const dataSource = createMockDataSource([
        { id: 'text', type: textPropertyModelConfig.type },
        { id: 'checkbox', type: checkboxPropertyModelConfig.type },
      ]);

      const next = resolveKanbanGroupBy(asDataSource(dataSource), {
        type: 'groupBy',
        columnId: 'text',
        name: 'text',
      });

      expect(next?.columnId).toBe('checkbox');
      expect(next?.name).toBe('boolean');
      expect(next?.hideEmpty).toBe(true);
    });
  });

  describe('detail selection', () => {
    it('should avoid recursive selection update when exiting select edit mode', () => {
      vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      }) as typeof requestAnimationFrame);
      try {
        let selection: DetailSelection;
        let beforeExitCalls = 0;

        const cell = {
          beforeEnterEditMode: () => true,
          beforeExitEditingMode: () => {
            beforeExitCalls += 1;
            selection.selection = {
              propertyId: 'status',
              isEditing: false,
            };
          },
          afterEnterEditingMode: () => {},
          focusCell: () => true,
          blurCell: () => true,
          forceUpdate: () => {},
        } satisfies DataViewCellLifeCycle;

        const field = {
          isFocus$: signal(false),
          isEditing$: signal(false),
          cell,
          focus: () => {},
          blur: () => {},
        };

        const detail = {
          querySelector: () => field,
        };

        selection = new DetailSelection(detail);
        selection.selection = {
          propertyId: 'status',
          isEditing: true,
        };

        selection.selection = {
          propertyId: 'status',
          isEditing: false,
        };

        expect(beforeExitCalls).toBe(1);
        expect(field.isEditing$.value).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
