import { computed, signal } from '@preact/signals-core';
import { describe, expect, it } from 'vitest';

import type { DataSource } from '../core/data-source/base.js';
import type { PropertyMetaConfig } from '../core/property/property-config.js';
import type { DataViewDataType } from '../core/view/data-view.js';
import type { ViewManager } from '../core/view-manager/view-manager.js';
import { textPropertyConfig } from '../property-presets/text/cell-renderer.js';
import {
  ChartProperty,
  ChartSingleView,
} from '../view-presets/chart/chart-view-manager.js';
import type { ChartViewData } from '../view-presets/chart/define.js';

type RowDef = {
  id: string;
  values: Record<string, unknown>;
};

interface ChartViewTestContext {
  view: ChartSingleView;
  manager: ViewManager;
  dataSource: DataSource;
  setReadonly(value: boolean): void;
}

interface CreateContextOptions {
  categoryPropertyId?: string;
  rows?: RowDef[];
  readonly?: boolean;
  /**
   * Allows overriding the raw view data returned by the data source.
   * Use `undefined` to simulate missing backing data.
   */
  viewDataOverride?: ChartViewData | undefined;
}

function createChartViewContext(
  options: CreateContextOptions = {}
): ChartViewTestContext {
  const viewId = 'chart-view';
  const readonlySignal = signal(options.readonly ?? false);

  const properties = [
    { id: 'title', type: 'title', name: 'Title' },
    { id: 'status', type: 'text', name: 'Status' },
  ];
  const propertyIds = properties.map(p => p.id);
  const propertyMetaMap = new Map<string, PropertyMetaConfig>([
    ['text', textPropertyConfig as unknown as PropertyMetaConfig],
  ]);
  const propertyById = new Map(properties.map(p => [p.id, p]));

  const rows = options.rows ?? [
    {
      id: 'row-1',
      values: { title: 'Task 1', status: 'To-do' },
    },
  ];
  const rowsSignal = signal(rows.map(r => r.id));
  const rowValues = new Map(rows.map(r => [r.id, { ...r.values }]));

  const propertiesSignal = signal(propertyIds);

  const viewData =
    options.viewDataOverride === undefined
      ? ({
          id: viewId,
          mode: 'chart',
          name: 'Chart',
          categoryPropertyId: options.categoryPropertyId,
        } satisfies ChartViewData)
      : options.viewDataOverride;

  const dataSource: Partial<DataSource> = {
    readonly$: computed(() => readonlySignal.value),
    featureFlags$: computed(() => ({}) as any),
    properties$: computed(() => propertiesSignal.value),
    propertyMetas$: computed(() => Array.from(propertyMetaMap.values())),
    allPropertyMetas$: computed(() => Array.from(propertyMetaMap.values())),
    rows$: computed(() => rowsSignal.value),
    viewConverts: [],
    viewMetas: [],
    viewDataList$: computed(() =>
      viewData ? ([viewData] as ChartViewData[]) : []
    ),
    viewDataGet: (id: string) => {
      if (!viewData || id !== viewId) return undefined;
      return viewData;
    },
    viewDataGet$: (id: string) =>
      computed(() => {
        if (!viewData || id !== viewId) return undefined;
        return viewData;
      }),
    viewDataAdd: () => {
      throw new Error('not implemented in test data source');
    },
    viewDataDuplicate: () => {
      throw new Error('not implemented in test data source');
    },
    viewDataDelete: () => {},
    viewDataMoveTo: () => {},
    viewDataUpdate: <ViewData extends DataViewDataType>(
      id: string,
      updater: (data: ViewData) => Partial<ViewData>
    ) => {
      if (!viewData || id !== viewId) {
        return;
      }
      Object.assign(viewData, updater(viewData as unknown as ViewData));
    },
    propertyMetaGet: (type: string) => propertyMetaMap.get(type),
    propertyNameGet: (propertyId: string) =>
      propertyById.get(propertyId)?.name ?? '',
    propertyNameSet: () => {},
    propertyTypeGet: (propertyId: string) => propertyById.get(propertyId)?.type,
    propertyTypeGet$: (propertyId: string) =>
      computed(() => propertyById.get(propertyId)?.type),
    propertyTypeSet: () => {},
    propertyTypeCanSet: () => true,
    propertyDataGet: () => ({}),
    propertyDataGet$: () => computed(() => ({})),
    propertyDataSet: () => {},
    propertyDataTypeGet: () => undefined,
    propertyDataTypeGet$: () => computed(() => undefined),
    propertyReadonlyGet: () => false,
    propertyReadonlyGet$: () => computed(() => false),
    propertyAdd: () => undefined,
    propertyDuplicate: () => undefined,
    propertyCanDuplicate: () => true,
    propertyDelete: () => {},
    propertyCanDelete: () => true,
    cellValueGet: (rowId: string, propertyId: string) => {
      return rowValues.get(rowId)?.[propertyId];
    },
    cellValueChange: (rowId: string, propertyId: string, value: unknown) => {
      const row = rowValues.get(rowId);
      if (row) {
        row[propertyId] = value;
      }
    },
    rowAdd: () => {
      throw new Error('not implemented in test data source');
    },
    rowDelete: () => {},
    rowMove: () => {},
    provider: {
      getOptional: () => null,
    } as any,
    serviceGet: () => null,
    serviceGetOrCreate: (_key, create) => create(),
    viewMetaGet: () => {
      throw new Error('not implemented in test data source');
    },
    viewMetaGet$: () => computed(() => undefined),
    viewMetaGetById: () => undefined,
    viewMetaGetById$: () => computed(() => undefined),
  };

  const manager: ViewManager = {
    dataSource: dataSource as DataSource,
    readonly$: computed(() => readonlySignal.value),
    viewMetas: [],
    currentViewId$: computed(() => viewId),
    currentView$: computed(() => undefined),
    setCurrentView: () => {},
    views$: computed(() => [viewId]),
    viewGet: () => undefined,
    viewAdd: () => {
      throw new Error('not implemented in test view manager');
    },
    viewDelete: () => {},
    viewDuplicate: () => {},
    viewDataGet: id => (dataSource.viewDataGet as any)(id),
    propertyGetOrCreate: () => {
      throw new Error('not implemented in test view manager');
    },
    moveTo: () => {},
    viewChangeType: () => {},
  };

  (dataSource as any).viewManager = manager;

  return {
    view: new ChartSingleView(manager, viewId),
    manager,
    dataSource: dataSource as DataSource,
    setReadonly: (value: boolean) => {
      readonlySignal.value = value;
    },
  };
}

describe('ChartSingleView', () => {
  it('returns empty category counts when no category property is selected', () => {
    const ctx = createChartViewContext({
      categoryPropertyId: undefined,
      rows: [
        { id: 'row-1', values: { status: 'Todo' } },
        { id: 'row-2', values: { status: 'Done' } },
      ],
    });

    expect(ctx.view.categoryCounts$.value).toEqual({});
  });

  it('counts rows grouped by the selected category property', () => {
    const ctx = createChartViewContext({
      categoryPropertyId: 'status',
      rows: [
        { id: 'row-1', values: { status: 'Todo' } },
        { id: 'row-2', values: { status: 'In Progress' } },
        { id: 'row-3', values: { status: 'Todo' } },
        { id: 'row-4', values: { status: '   ' } }, // blank values ignored
        { id: 'row-5', values: { status: undefined } },
      ],
    });

    expect(ctx.view.categoryCounts$.value).toEqual({
      Todo: 2,
      'In Progress': 1,
    });
  });

  it('exposes raw values and row ids per category', () => {
    const ctx = createChartViewContext({
      categoryPropertyId: 'status',
      rows: [
        { id: 'row-1', values: { status: 'Todo' } },
        { id: 'row-2', values: { status: 'Todo' } },
        { id: 'row-3', values: { status: 'Complete' } },
      ],
    });

    expect(ctx.view.categoryRawValues$.value).toMatchObject({
      Todo: 'Todo',
      Complete: 'Complete',
    });
    expect(ctx.view.categoryRowIds$.value).toMatchObject({
      Todo: ['row-1', 'row-2'],
      Complete: ['row-3'],
    });
    expect(ctx.view.categoryPropertyType$.value).toBe('text');
  });

  it('exposes all datasource properties as visible columns', () => {
    const ctx = createChartViewContext({
      categoryPropertyId: 'status',
    });

    const rawProperties = ctx.view.propertiesRaw$.value;
    expect(rawProperties.map(prop => prop.id)).toEqual(['title', 'status']);
    expect(rawProperties.every(prop => prop instanceof ChartProperty)).toBe(
      true
    );
    expect(ctx.view.properties$.value).toBe(rawProperties);
    expect(ctx.view.detailProperties$.value).toBe(rawProperties);
    expect(ctx.view.mainProperties$.value.titleColumn).toBe('title');
    expect(ctx.view.mainProperties$.value.iconColumn).toBe('type');
  });

  it('mirrors the view manager readonly state', () => {
    const ctx = createChartViewContext({ readonly: false });
    expect(ctx.view.readonly$.value).toBe(false);

    ctx.setReadonly(true);
    expect(ctx.view.readonly$.value).toBe(true);
  });

  it('falls back to chart type when backing data is missing', () => {
    const ctx = createChartViewContext({
      viewDataOverride: undefined,
    });

    expect(ctx.view.type).toBe('chart');
  });
});

describe('ChartProperty', () => {
  it('always stays visible and ignores hide requests', () => {
    const ctx = createChartViewContext({
      categoryPropertyId: 'status',
    });
    const property = ctx.view.propertyGetOrCreate('status') as ChartProperty;

    expect(property.hide$.value).toBe(false);
    property.hideSet(true);
    expect(property.hide$.value).toBe(false);
  });

  it('does not reorder properties when move is called', () => {
    const ctx = createChartViewContext({
      categoryPropertyId: 'status',
    });
    const property = ctx.view.propertyGetOrCreate('status') as ChartProperty;

    property.move({ id: 'title', before: false } as any);
    expect(ctx.view.propertiesRaw$.value.map(prop => prop.id)).toEqual([
      'title',
      'status',
    ]);
  });
});
