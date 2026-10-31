import { createTaskIdentity } from '@blocksuite/affine-shared/utils';
import { signal } from '@preact/signals-core';
import { render } from 'lit';
import { describe, expect, it, vi } from 'vitest';

import type { GroupBy } from '../core/common/types.js';
import type { DataSource } from '../core/data-source/base.js';
import { DetailSelection } from '../core/detail/selection.js';
import type { FilterGroup } from '../core/filter/types.js';
import { groupByMatchers } from '../core/group-by/define.js';
import { GroupTrait, sortByManually } from '../core/group-by/trait.js';
import { t } from '../core/logical/type-presets.js';
import type { DataViewCellLifeCycle } from '../core/property/index.js';
import type { Row } from '../core/view-manager/row.js';
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
import {
  getKanbanParentContext,
  type KanbanHierarchyProperty,
} from '../view-presets/kanban/hierarchy-context.js';
import {
  KanbanSingleView,
  materializeKanbanColumns,
} from '../view-presets/kanban/kanban-view-manager.js';
import { KanbanCard } from '../view-presets/kanban/pc/card.js';
import { KanbanDragController } from '../view-presets/kanban/pc/controller/drag.js';
import type { KanbanGroup } from '../view-presets/kanban/pc/group.js';

type Column = {
  id: string;
  type: string;
  data?: Record<string, unknown>;
};

const taskIdentity = (blockId: string, docId = 'doc') =>
  createTaskIdentity({ docId, blockId });

const createHierarchyProperties = (options: {
  titles: Record<string, string>;
  levels: Record<string, string | number>;
  parents: Record<string, string>;
}): KanbanHierarchyProperty[] => [
  {
    id: 'title',
    name$: { value: 'Title' },
    stringValueGet: rowId => options.titles[rowId],
    cellGetOrCreate: rowId => ({
      jsonValue$: { value: options.titles[rowId] },
    }),
  },
  {
    id: 'level',
    name$: { value: 'Hierarchy Level' },
    stringValueGet: rowId => String(options.levels[rowId] ?? ''),
  },
  {
    id: 'parent',
    name$: { value: 'Parent Identifier' },
    stringValueGet: rowId => options.parents[rowId],
  },
];

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

const createTestRow = (rowId: string): Row => ({
  rowId,
  cells$: signal([]) as Row['cells$'],
  index$: signal<Row['index$']['value']>(undefined),
  prev$: signal<Row | undefined>(undefined),
  next$: signal<Row | undefined>(undefined),
  delete: vi.fn(),
  move: vi.fn(),
});

const createGroupTraitHarness = (options?: {
  groupProperties?: Array<{
    key: string;
    hide: boolean;
    manuallyCardSort: string[];
  }>;
  rowIds?: string[];
  values?: Record<string, boolean>;
}) => {
  const dataSource = createMockDataSource([
    {
      id: 'checkbox',
      type: checkboxPropertyModelConfig.type,
    },
  ]);

  const property = {
    id: 'checkbox',
    dataType$: signal(t.boolean.instance()),
    meta$: signal({ config: {} }),
  };

  const groupProperties = options?.groupProperties ?? [
    {
      key: 'true',
      hide: false,
      manuallyCardSort: [],
    },
    {
      key: 'false',
      hide: false,
      manuallyCardSort: [],
    },
  ];
  const rows = options?.rowIds ?? [];
  const data$ = signal({
    groupProperties,
  });
  const cellValues = new Map(
    Object.entries(options?.values ?? {}).map(([rowId, value]) => [
      `${rowId}:checkbox`,
      value,
    ])
  );
  const cells = new Map<
    string,
    {
      jsonValue$: ReturnType<typeof signal<boolean | undefined>>;
      jsonValueSet: ReturnType<typeof vi.fn<(value: unknown) => void>>;
      valueSet: ReturnType<typeof vi.fn<(value: unknown) => void>>;
    }
  >();

  const cellGetOrCreate = (rowId: string, propertyId: string) => {
    const key = `${rowId}:${propertyId}`;
    const existing = cells.get(key);
    if (existing) {
      return existing;
    }

    const jsonValue$ = signal(cellValues.get(key));
    const update = (value: unknown) => {
      jsonValue$.value = value as boolean | undefined;
      cellValues.set(key, value as boolean);
    };
    const cell = {
      jsonValue$,
      jsonValueSet: vi.fn(update),
      valueSet: vi.fn(update),
    };
    cells.set(key, cell);
    return cell;
  };

  const isLocked$ = signal(false);
  const view = {
    data$,
    rows$: signal(rows.map(createTestRow)),
    isLocked$,
    lockRows: vi.fn((locked: boolean) => {
      isLocked$.value = locked;
    }),
    manager: {
      dataSource: asDataSource(dataSource),
    },
    propertyGetOrCreate: () => property,
    cellGetOrCreate,
  };

  const groupBy$ = signal<GroupBy | undefined>({
    type: 'groupBy',
    columnId: 'checkbox',
    name: 'boolean',
    hideEmpty: false,
    sort: { desc: false },
  });

  const ops = {
    groupBySet: vi.fn(),
    sortGroup: (keys: string[], asc?: boolean) => {
      const sorted = sortByManually(
        keys,
        value => value,
        data$.value.groupProperties.map(value => value.key)
      );
      return asc === false ? sorted.reverse() : sorted;
    },
    sortRow: (groupKey: string, groupedRows: Row[]) => {
      const group = data$.value.groupProperties.find(
        value => value.key === groupKey
      );
      return sortByManually(
        groupedRows,
        row => row.rowId,
        group?.manuallyCardSort ?? []
      );
    },
    changeGroupSort: vi.fn(),
    changeRowSort: vi.fn(),
    changeGroupHide: vi.fn(),
  };

  return {
    groupTrait: new GroupTrait(groupBy$, view as never, ops),
    ops,
    cells,
    view,
  };
};

describe('kanban', () => {
  describe('hierarchy parent context', () => {
    it('resolves parent title and hierarchy level for child cards', () => {
      const context = getKanbanParentContext({
        rowId: 'child',
        docId: 'doc',
        properties: createHierarchyProperties({
          titles: {
            parent: 'Launch Plan',
            child: 'Write QA notes',
          },
          levels: {
            parent: 0,
            child: 1,
          },
          parents: {
            child: taskIdentity('parent'),
          },
        }),
      });

      expect(context).toEqual({
        parentId: 'parent',
        parentIdentifier: taskIdentity('parent'),
        parentTitle: 'Launch Plan',
        parentDisplayName: 'Launch Plan',
        level: 1,
      });
    });

    it('returns undefined for root, stale, and cross-doc parent references', () => {
      const properties = createHierarchyProperties({
        titles: {
          root: 'Root',
          child: 'Child',
          crossDocChild: 'Cross doc child',
        },
        levels: {
          root: 0,
          child: 1,
          crossDocChild: 1,
        },
        parents: {
          child: taskIdentity('missing'),
          crossDocChild: taskIdentity('parent', 'other-doc'),
        },
      });

      expect(
        getKanbanParentContext({ rowId: 'root', docId: 'doc', properties })
      ).toBeUndefined();
      expect(
        getKanbanParentContext({ rowId: 'child', docId: 'doc', properties })
      ).toBeUndefined();
      expect(
        getKanbanParentContext({
          rowId: 'crossDocChild',
          docId: 'doc',
          properties,
        })
      ).toBeUndefined();
    });

    it('uses reactive title json values before string fallback', () => {
      const properties = createHierarchyProperties({
        titles: {
          parent: 'Old title',
          child: 'Child',
        },
        levels: {
          child: 1,
        },
        parents: {
          child: taskIdentity('parent'),
        },
      });
      properties[0] = {
        ...properties[0]!,
        cellGetOrCreate: rowId => ({
          jsonValue$: { value: rowId === 'parent' ? 'Updated title' : 'Child' },
        }),
      };

      expect(
        getKanbanParentContext({
          rowId: 'child',
          docId: 'doc',
          properties,
        })?.parentTitle
      ).toBe('Updated title');
    });

    it('ignores malformed, self, and non-row parent references', () => {
      const properties = createHierarchyProperties({
        titles: {
          parent: 'Parent',
          child: 'Child',
          orphan: 'Orphan',
          self: 'Self',
          malformed: 'Malformed',
        },
        levels: {
          child: 1,
          orphan: 1,
          self: 1,
          malformed: 1,
        },
        parents: {
          child: taskIdentity('parent'),
          orphan: taskIdentity('external-row'),
          self: taskIdentity('self'),
          malformed: '%E0%A4%A',
        },
      });

      expect(
        getKanbanParentContext({
          rowId: 'child',
          docId: 'doc',
          properties,
          rowIds: ['parent', 'child'],
        })?.parentId
      ).toBe('parent');
      expect(
        getKanbanParentContext({
          rowId: 'orphan',
          docId: 'doc',
          properties,
          rowIds: ['parent', 'child', 'orphan'],
        })
      ).toBeUndefined();
      expect(
        getKanbanParentContext({
          rowId: 'self',
          docId: 'doc',
          properties,
          rowIds: ['self'],
        })
      ).toBeUndefined();
      expect(
        getKanbanParentContext({
          rowId: 'malformed',
          docId: 'doc',
          properties,
          rowIds: ['malformed'],
        })
      ).toBeUndefined();
    });

    it('omits hierarchy level when the level value is missing or invalid', () => {
      const properties = createHierarchyProperties({
        titles: {
          parent: 'Parent',
          child: 'Child',
        },
        levels: {},
        parents: {
          child: taskIdentity('parent'),
        },
      });

      expect(
        getKanbanParentContext({
          rowId: 'child',
          docId: 'doc',
          properties,
          rowIds: ['parent', 'child'],
        })?.level
      ).toBeUndefined();
    });

    it('renders an accessible parent detail trigger without a fallback level', () => {
      if (!customElements.get('affine-data-view-kanban-card')) {
        customElements.define('affine-data-view-kanban-card', KanbanCard);
      }
      const card = document.createElement(
        'affine-data-view-kanban-card'
      ) as KanbanCard;
      const openDetailPanel = vi.fn();
      const selection = {
        selection: { selectionType: 'card', cards: [] },
        view: undefined,
      };
      const view = {
        manager: { dataSource: { doc: { id: 'doc' } } },
        propertiesRaw$: {
          value: createHierarchyProperties({
            titles: {
              parent: 'Parent Task',
              child: 'Child Task',
            },
            levels: {},
            parents: {
              child: taskIdentity('parent'),
            },
          }),
        },
        rowIds$: { value: ['parent', 'child'] },
      };
      selection.view = view as never;
      card.cardId = 'child';
      card.groupKey = 'group';
      card.kanbanViewLogic = {
        view,
        selectionController: selection,
        root: { openDetailPanel },
      } as never;

      const host = document.createElement('div');
      render(
        (
          card as never as { renderParentContext: () => unknown }
        ).renderParentContext(),
        host
      );
      const button =
        host.querySelector<HTMLButtonElement>('.card-parent-title');

      expect(button?.textContent?.trim()).toBe('Parent: Parent Task');
      expect(button?.tagName).toBe('BUTTON');
      expect(host.textContent).not.toContain('Level: 0');

      button?.click();

      expect(openDetailPanel).toHaveBeenCalledWith(
        expect.objectContaining({ rowId: 'parent' })
      );
    });
  });

  describe('group trait', () => {
    it('reapplies manual card order when building grouped rows', () => {
      const { groupTrait } = createGroupTraitHarness({
        groupProperties: [
          {
            key: 'true',
            hide: false,
            manuallyCardSort: ['row-2', 'row-1'],
          },
          {
            key: 'false',
            hide: false,
            manuallyCardSort: [],
          },
        ],
        rowIds: ['row-1', 'row-2'],
        values: {
          'row-1': true,
          'row-2': true,
        },
      });

      expect(
        groupTrait.groupsDataList$.value
          ?.find(group => group.key === 'true')
          ?.rows.map(row => row.rowId)
      ).toEqual(['row-2', 'row-1']);
    });

    it('preserves manual group order when updating card sort', () => {
      const { groupTrait, ops, cells, view } = createGroupTraitHarness({
        groupProperties: [
          {
            key: 'false',
            hide: false,
            manuallyCardSort: ['row-1'],
          },
          {
            key: 'true',
            hide: false,
            manuallyCardSort: ['row-2'],
          },
        ],
        rowIds: ['row-1', 'row-2'],
        values: {
          'row-1': false,
          'row-2': true,
        },
      });

      expect(
        groupTrait.groupsDataList$.value
          ?.find(group => group.key === 'true')
          ?.rows.map(row => row.rowId)
      ).toEqual(['row-2']);
      view.lockRows(true);

      groupTrait.moveCardTo('row-1', 'false', 'true', 'end');

      expect(view.lockRows).toHaveBeenLastCalledWith(false);
      expect(
        groupTrait.groupsDataList$.value
          ?.find(group => group.key === 'true')
          ?.rows.map(row => row.rowId)
      ).toEqual(['row-2', 'row-1']);
      expect(ops.changeRowSort).toHaveBeenCalledWith(
        ['false', 'true'],
        'true',
        ['row-2', 'row-1']
      );
      expect(cells.get('row-1:checkbox')?.jsonValueSet).toHaveBeenCalledWith(
        true
      );
    });
  });

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

  describe('filtering', () => {
    const sharedFilter: FilterGroup = {
      type: 'group',
      op: 'and',
      conditions: [
        {
          type: 'filter',
          left: {
            type: 'ref',
            name: 'status',
          },
          function: 'is',
          args: [{ type: 'literal', value: 'Done' }],
        },
      ],
    };

    const sharedTitleProperty = {
      id: 'title',
      cellGetOrCreate: () => ({
        jsonValue$: {
          value: 'Task 1',
        },
      }),
    };

    it('evaluates filters with hidden columns', () => {
      const statusProperty = {
        id: 'status',
        cellGetOrCreate: () => ({
          jsonValue$: {
            value: 'Done',
          },
        }),
      };

      const view = {
        filter$: { value: sharedFilter },
        // Simulate status being hidden in current view.
        properties$: { value: [sharedTitleProperty] },
        propertiesRaw$: { value: [sharedTitleProperty, statusProperty] },
      } as unknown as KanbanSingleView;

      expect(KanbanSingleView.prototype.isShow.call(view, 'row-1')).toBe(true);
    });

    it('returns false when hidden filtered column does not match', () => {
      const statusProperty = {
        id: 'status',
        cellGetOrCreate: () => ({
          jsonValue$: {
            value: 'In Progress',
          },
        }),
      };

      const view = {
        filter$: { value: sharedFilter },
        // Simulate status being hidden in current view.
        properties$: { value: [sharedTitleProperty] },
        propertiesRaw$: { value: [sharedTitleProperty, statusProperty] },
      } as unknown as KanbanSingleView;

      expect(KanbanSingleView.prototype.isShow.call(view, 'row-1')).toBe(false);
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
