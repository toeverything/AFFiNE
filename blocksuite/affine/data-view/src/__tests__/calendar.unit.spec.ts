import { DocDisplayMetaProvider } from '@blocksuite/affine-shared/services';
import { signal } from '@preact/signals-core';
import { describe, expect, it, vi } from 'vitest';

import type { DataSource } from '../core/data-source/base.js';
import {
  CalendarSingleView,
  type CalendarStoredViewData,
  calendarViewModel,
} from '../view-presets/calendar/index.js';
import {
  formatEntryTime,
  openCalendarEntry,
} from '../view-presets/calendar/pc/actions.js';
import { getCalendarDndEntity } from '../view-presets/calendar/pc/dnd.js';
import { viewConverts } from '../view-presets/convert.js';

const day = (value: string) => new Date(`${value}T00:00:00`).getTime();

const createCalendarView = (options?: {
  startColumnId?: string;
  endColumnId?: string;
  datePropertyType?: string;
  rows?: string[];
  filterValue?: string;
  titleValue?: unknown;
  linkedDocTitles?: Record<string, string>;
  visiblePropertyIds?: string[];
  externalFactories?: Map<unknown, unknown>;
}) => {
  const rows = signal(options?.rows ?? ['row-1']);
  const columns = signal(['title', 'date', 'end-date', 'status']);
  const viewData = signal<CalendarStoredViewData>({
    id: 'view-1',
    name: 'Calendar',
    mode: 'calendar',
    filter: options?.filterValue
      ? {
          type: 'group',
          op: 'and',
          conditions: [
            {
              type: 'filter',
              left: { type: 'ref', name: 'status' },
              function: 'is',
              args: [{ type: 'literal', value: options.filterValue }],
            },
          ],
        }
      : {
          type: 'group',
          op: 'and',
          conditions: [],
        },
    date: {
      startColumnId: options?.startColumnId,
      endColumnId: options?.endColumnId,
    },
    card: {
      titleColumnId: 'title',
      visiblePropertyIds: options?.visiblePropertyIds ?? [],
    },
    sources: {
      workspaceCalendar: {
        enabled: true,
      },
    },
  });
  const values = new Map<string, unknown>([
    ['row-1:date', day('2026-05-15')],
    ['row-1:end-date', day('2026-05-17')],
    ['row-1:status', 'Done'],
    ['row-1:title', options?.titleValue ?? 'Task'],
    ['row-2:date', day('2026-05-16')],
    ['row-2:end-date', day('2026-05-14')],
    ['row-2:status', 'Todo'],
    ['row-2:title', 'Hidden'],
  ]);
  const types = new Map<string, string>([
    ['title', 'title'],
    ['date', options?.datePropertyType ?? 'date'],
    ['end-date', 'date'],
    ['status', 'text'],
  ]);

  const dataSource = {
    rows$: rows,
    properties$: columns,
    readonly$: signal(false),
    featureFlags$: signal({ enable_table_virtual_scroll: false }),
    provider: {
      getAll: () => options?.externalFactories ?? new Map(),
    },
    viewDataGet: () => viewData.value,
    viewDataUpdate: (
      _id: string,
      updater: (data: CalendarStoredViewData) => Partial<CalendarStoredViewData>
    ) => {
      viewData.value = { ...viewData.value, ...updater(viewData.value) };
    },
    cellValueGet: (rowId: string, propertyId: string) =>
      values.get(`${rowId}:${propertyId}`),
    cellValueChange: (rowId: string, propertyId: string, value: unknown) => {
      values.set(`${rowId}:${propertyId}`, value);
    },
    rowAdd: () => {
      const rowId = `row-${rows.value.length + 1}`;
      rows.value = [...rows.value, rowId];
      return rowId;
    },
    propertyTypeGet: (propertyId: string) => types.get(propertyId),
    propertyNameGet: (propertyId: string) => propertyId,
    propertyDataGet: () => ({}),
    propertyReadonlyGet: () => false,
    serviceGet: (key: unknown) => {
      if (key !== DocDisplayMetaProvider) {
        return null;
      }
      return {
        title: (pageId: string, referenceInfo?: { title?: string }) =>
          signal(referenceInfo?.title ?? options?.linkedDocTitles?.[pageId]),
      };
    },
    propertyMetaGet: (type: string) => ({
      type,
      config: {
        rawValue: {
          toJson: ({ value }: { value: unknown }) => {
            const deltas =
              typeof value === 'object' && value != null && 'deltas$' in value
                ? (value as { deltas$?: { value?: unknown } }).deltas$?.value
                : undefined;
            if (!Array.isArray(deltas)) {
              return value;
            }
            return deltas
              .map(delta => {
                const item = delta as {
                  insert?: unknown;
                  attributes?: {
                    reference?: {
                      type?: string;
                      pageId?: unknown;
                    };
                  };
                };
                const pageId = item.attributes?.reference?.pageId;
                if (
                  item.attributes?.reference?.type === 'LinkedPage' &&
                  typeof pageId === 'string'
                ) {
                  return (
                    options?.linkedDocTitles?.[pageId] ?? item.insert ?? ''
                  );
                }
                return item.insert ?? '';
              })
              .join('');
          },
          fromJson: ({ value }: { value: unknown }) => value,
          toString: ({ value }: { value: unknown }) =>
            typeof value === 'string' ? value : '',
        },
        jsonValue: {
          schema: {
            safeParse: (value: unknown) => ({ success: true, data: value }),
          },
          isEmpty: () => false,
          type: () => undefined,
        },
      },
      renderer: {},
    }),
    propertyAdd: () => {
      columns.value = [...columns.value, 'created-date'];
      types.set('created-date', 'date');
      return 'created-date';
    },
    propertyCanDelete: () => true,
    propertyCanDuplicate: () => true,
    propertyTypeCanSet: () => true,
  } as unknown as DataSource;
  const manager = {
    dataSource,
    readonly$: signal(false),
  };
  return {
    view: new CalendarSingleView(manager as any, 'view-1'),
    viewData,
    values,
    types,
    columns,
  };
};

describe('CalendarSingleView', () => {
  it('creates default view data without selecting a start date', () => {
    const data = calendarViewModel.model.defaultData({
      dataSource: {
        properties$: signal(['title', 'date']),
        propertyTypeGet: (id: string) => (id === 'title' ? 'title' : 'date'),
      },
    } as any);

    expect(data.date).toEqual({});
    expect(data.card).toEqual({
      titleColumnId: 'title',
      visiblePropertyIds: [],
    });
  });

  it('enters setup state without a start date property', () => {
    const { view } = createCalendarView();

    expect(view.dateMapping$.value.status).toBe('setup');
  });

  it('enters setup state when start date column is not date', () => {
    const { view } = createCalendarView({
      startColumnId: 'date',
      datePropertyType: 'text',
    });

    expect(view.dateMapping$.value.status).toBe('setup');
  });

  it('enters setup state after date property deletion', () => {
    const { view, columns } = createCalendarView({ startColumnId: 'date' });

    columns.value = ['title', 'status'];

    expect(view.dateMapping$.value.status).toBe('setup');
  });

  it('creates row entries after filtering rows', () => {
    const { view } = createCalendarView({
      startColumnId: 'date',
      rows: ['row-1', 'row-2'],
      filterValue: 'Done',
    });

    expect(view.rowEntries$.value.map(entry => entry.rowId)).toEqual(['row-1']);
  });

  it('updates entry date after row date value changes', () => {
    const { view, values } = createCalendarView({ startColumnId: 'date' });

    values.set('row-1:date', day('2026-05-20'));

    expect(view.rowEntries$.value[0]?.startAt).toBe(day('2026-05-20'));
  });

  it('creates row range entries and falls back when end date is invalid', () => {
    const { view } = createCalendarView({
      startColumnId: 'date',
      endColumnId: 'end-date',
      rows: ['row-1', 'row-2'],
    });

    expect(
      view.rowEntries$.value.map(entry => [
        entry.rowId,
        entry.startAt,
        entry.endAt,
      ])
    ).toEqual([
      ['row-1', day('2026-05-15'), day('2026-05-17')],
      ['row-2', day('2026-05-16'), undefined],
    ]);
    expect(view.rowEntries$.value[0]?.canResizeRange).toBe(true);
  });

  it('moves row range while preserving duration', () => {
    const { view, values } = createCalendarView({
      startColumnId: 'date',
      endColumnId: 'end-date',
    });

    view.moveRowToDate('row-1', day('2026-05-20'));

    expect(values.get('row-1:date')).toBe(day('2026-05-20'));
    expect(values.get('row-1:end-date')).toBe(day('2026-05-22'));
  });

  it('resizes row range without crossing start and end', () => {
    const { view, values } = createCalendarView({
      startColumnId: 'date',
      endColumnId: 'end-date',
    });

    view.resizeRowRange('row-1', 'start', day('2026-05-18'));
    expect(values.get('row-1:date')).toBe(day('2026-05-17'));

    view.resizeRowRange('row-1', 'end', day('2026-05-14'));
    expect(values.get('row-1:end-date')).toBe(day('2026-05-17'));
  });

  it('creates a row with default filter values and target date', () => {
    const { view, values } = createCalendarView({
      startColumnId: 'date',
      filterValue: 'Done',
    });

    const rowId = view.createRowOnDate(day('2026-05-25'));

    expect(rowId).toBe('row-2');
    expect(values.get('row-2:date')).toBe(day('2026-05-25'));
    expect(values.get('row-2:status')).toBe('Done');
    expect(view.emptyMonthHintDismissed$.value).toBe(true);
  });

  it('creates a dated linked-doc row', () => {
    const { view, values } = createCalendarView({
      startColumnId: 'date',
      filterValue: 'Done',
    });

    const rowId = view.createLinkedDocRowOnDate(day('2026-05-25'), 'doc-1');
    const title = values.get('row-2:title') as
      | { toDelta?: () => unknown[] }
      | undefined;

    expect(rowId).toBe('row-2');
    expect(values.get('row-2:date')).toBe(day('2026-05-25'));
    expect(values.get('row-2:status')).toBe('Done');
    expect(title?.toDelta?.()).toEqual([
      {
        insert: ' ',
        attributes: {
          reference: {
            type: 'LinkedPage',
            pageId: 'doc-1',
          },
        },
      },
    ]);
  });

  it('dismisses the empty month hint on the current calendar view', () => {
    const { view, viewData } = createCalendarView({
      startColumnId: 'date',
    });

    expect(view.emptyMonthHintDismissed$.value).toBe(false);

    view.dismissEmptyMonthHint();

    expect(view.emptyMonthHintDismissed$.value).toBe(true);
    expect('ui' in viewData.value && viewData.value.ui).toEqual({
      emptyMonthHintDismissed: true,
    });
  });

  it('updates workspace calendar settings when legacy view data has no sources', () => {
    const { view, viewData } = createCalendarView({
      startColumnId: 'date',
    });
    viewData.value = {
      ...viewData.value,
      sources: undefined as unknown as CalendarStoredViewData['sources'],
    };

    view.setWorkspaceCalendarEnabled(false);

    expect(viewData.value.sources.workspaceCalendar).toEqual({
      enabled: false,
    });
  });

  it('enters setup state when legacy view data has no date config', () => {
    const { view, viewData } = createCalendarView({
      startColumnId: 'date',
      endColumnId: 'end-date',
    });
    viewData.value = {
      ...viewData.value,
      date: undefined as unknown as CalendarStoredViewData['date'],
    };

    expect(view.dateMapping$.value).toEqual({
      status: 'setup',
      propertyId: undefined,
    });
    expect(view.endDateMapping$.value).toEqual({
      status: 'setup',
      propertyId: undefined,
    });
  });

  it('generates card properties from visible property ids', () => {
    const { view } = createCalendarView({
      startColumnId: 'date',
      visiblePropertyIds: ['status'],
    });

    expect(view.rowEntries$.value[0]?.cardProperties).toEqual([
      {
        propertyId: 'status',
        value: 'Done',
      },
    ]);
  });

  it('parses single linked doc id from title cell', () => {
    const { view } = createCalendarView({
      startColumnId: 'date',
      linkedDocTitles: {
        'doc-1': 'Linked doc title',
      },
      titleValue: {
        deltas$: {
          value: [
            {
              insert: 'Doc',
              attributes: {
                reference: {
                  type: 'LinkedPage',
                  pageId: 'doc-1',
                },
              },
            },
          ],
        },
      },
    });

    expect(view.rowEntries$.value[0]?.titleSegments).toEqual([
      { text: 'Linked doc title', linkedDoc: true },
    ]);
    expect(view.rowEntries$.value[0]?.title).toBe('Linked doc title');
  });

  it('uses normal title text for multiple linked doc titles', () => {
    const { view } = createCalendarView({
      startColumnId: 'date',
      linkedDocTitles: {
        'doc-1': 'Doc 1',
        'doc-2': 'Doc 2',
      },
      titleValue: {
        deltas$: {
          value: [
            {
              insert: 'Doc 1',
              attributes: {
                reference: {
                  type: 'LinkedPage',
                  pageId: 'doc-1',
                },
              },
            },
            {
              insert: 'Doc 2',
              attributes: {
                reference: {
                  type: 'LinkedPage',
                  pageId: 'doc-2',
                },
              },
            },
          ],
        },
      },
    });

    expect(view.rowEntries$.value[0]?.titleSegments).toEqual([
      { text: 'Doc 1', linkedDoc: true },
      { text: 'Doc 2', linkedDoc: true },
    ]);
    expect(view.rowEntries$.value[0]?.title).toBe('Doc 1Doc 2');
  });

  it('falls back to the resolved title when linked doc deltas only contain placeholders', () => {
    const { view } = createCalendarView({
      startColumnId: 'date',
      linkedDocTitles: {
        'doc-1': 'Doc 1',
        'doc-2': 'Doc 2',
      },
      titleValue: {
        deltas$: {
          value: [
            {
              insert: ' ',
              attributes: {
                reference: {
                  type: 'LinkedPage',
                  pageId: 'doc-1',
                },
              },
            },
            {
              insert: ' ',
              attributes: {
                reference: {
                  type: 'LinkedPage',
                  pageId: 'doc-2',
                },
              },
            },
          ],
        },
      },
    });

    expect(view.rowEntries$.value[0]?.titleSegments).toEqual([
      { text: 'Doc 1', linkedDoc: true },
      { text: 'Doc 2', linkedDoc: true },
    ]);
  });

  it('merges linked doc placeholders with the following plain title text', () => {
    const { view } = createCalendarView({
      startColumnId: 'date',
      titleValue: {
        deltas$: {
          value: [
            {
              insert: ' ',
              attributes: {
                reference: { type: 'LinkedPage', pageId: 'doc-1' },
              },
            },
            { insert: 'How to use folder and Tags' },
          ],
        },
      },
    });

    expect(view.rowEntries$.value[0]?.titleSegments).toEqual([
      { text: 'How to use folder and Tags', linkedDoc: true },
    ]);
  });

  it('updates date mapping through setup APIs', () => {
    const { view, viewData, values } = createCalendarView({
      startColumnId: 'date',
    });

    view.moveRowToDate('row-1', day('2026-05-21'));
    expect(values.get('row-1:date')).toBe(day('2026-05-21'));

    view.setDateColumn('date');
    expect('date' in viewData.value && viewData.value.date.startColumnId).toBe(
      'date'
    );

    expect(view.createDateColumn()).toBe('created-date');
    expect('date' in viewData.value && viewData.value.date.startColumnId).toBe(
      'created-date'
    );
  });

  it('aggregates external source entries without mutating view data', async () => {
    const externalEntry = {
      kind: 'external',
      id: 'external:1',
      sourceId: 'source',
      externalId: '1',
      title: 'External',
      startAt: day('2026-05-15'),
      canResizeRange: false,
    } as const;
    const anotherExternalEntry = {
      kind: 'external',
      id: 'external:2',
      sourceId: 'another-source',
      externalId: '2',
      title: 'Another external',
      startAt: day('2026-05-16'),
      canResizeRange: false,
    } as const;
    const { view, viewData } = createCalendarView({
      startColumnId: 'date',
      externalFactories: new Map([
        [
          'source',
          {
            create: () => ({
              id: 'source',
              getEntries: () => [externalEntry],
            }),
          },
        ],
        [
          'another-source',
          {
            create: () => ({
              id: 'another-source',
              getEntries: () => Promise.resolve([anotherExternalEntry]),
            }),
          },
        ],
      ]),
    });
    const viewDataBefore = JSON.stringify(viewData.value);

    await expect(
      view.loadExternalEntries({
        from: day('2026-05-01'),
        to: day('2026-05-31'),
      })
    ).resolves.toEqual([externalEntry, anotherExternalEntry]);
    expect(JSON.stringify(viewData.value)).toBe(viewDataBefore);
  });

  it('keeps successful external entries when another source fails', async () => {
    const externalEntry = {
      kind: 'external',
      id: 'external:1',
      sourceId: 'source',
      externalId: '1',
      title: 'External',
      startAt: day('2026-05-15'),
      canResizeRange: false,
    } as const;
    const { view } = createCalendarView({
      startColumnId: 'date',
      externalFactories: new Map([
        [
          'source',
          {
            create: () => ({
              id: 'source',
              getEntries: () => [externalEntry],
            }),
          },
        ],
        [
          'failing-source',
          {
            create: () => ({
              id: 'failing-source',
              getEntries: () => Promise.reject(new Error('denied')),
            }),
          },
        ],
      ]),
    });

    await expect(
      view.loadExternalEntries({
        from: day('2026-05-01'),
        to: day('2026-05-31'),
      })
    ).resolves.toEqual([externalEntry]);
  });

  it('does not let stale external entry loads overwrite newer entries', async () => {
    const oldEntry = {
      kind: 'external',
      id: 'external:old',
      sourceId: 'source',
      externalId: 'old',
      title: 'Old',
      startAt: day('2026-05-15'),
      canResizeRange: false,
    } as const;
    const newEntry = {
      kind: 'external',
      id: 'external:new',
      sourceId: 'source',
      externalId: 'new',
      title: 'New',
      startAt: day('2026-06-15'),
      canResizeRange: false,
    } as const;
    let resolveOld!: (entries: [typeof oldEntry]) => void;
    let resolveNew!: (entries: [typeof newEntry]) => void;
    const oldRequest = new Promise<[typeof oldEntry]>(resolve => {
      resolveOld = resolve;
    });
    const newRequest = new Promise<[typeof newEntry]>(resolve => {
      resolveNew = resolve;
    });
    const getEntries = vi
      .fn()
      .mockReturnValueOnce(oldRequest)
      .mockReturnValueOnce(newRequest);
    const { view } = createCalendarView({
      startColumnId: 'date',
      externalFactories: new Map([
        [
          'source',
          {
            create: () => ({
              id: 'source',
              getEntries,
            }),
          },
        ],
      ]),
    });

    const firstLoad = view.loadExternalEntries({
      from: day('2026-05-01'),
      to: day('2026-05-31'),
    });
    const secondLoad = view.loadExternalEntries({
      from: day('2026-06-01'),
      to: day('2026-06-30'),
    });

    resolveNew([newEntry]);
    await expect(secondLoad).resolves.toEqual([newEntry]);
    expect(
      view.entries$.value.filter(entry => entry.kind === 'external')
    ).toEqual([newEntry]);

    resolveOld([oldEntry]);
    await expect(firstLoad).resolves.toEqual([oldEntry]);
    expect(
      view.entries$.value.filter(entry => entry.kind === 'external')
    ).toEqual([newEntry]);
  });
});

describe('calendar entry actions', () => {
  it('formats external event popover time ranges with end time', () => {
    const label = formatEntryTime({
      kind: 'external',
      id: 'external:1',
      sourceId: 'workspace-calendar',
      externalId: '1',
      title: 'Planning',
      startAt: new Date('2026-05-15T10:00:00').getTime(),
      endAt: new Date('2026-05-15T11:00:00').getTime(),
      canResizeRange: false,
    });

    expect(label).toContain(' - ');
    expect(label).toContain('2026');
  });

  it('opens row entries through the detail panel hook', () => {
    const openDetailPanel = vi.fn();
    const { view } = createCalendarView({ startColumnId: 'date' });
    const target = {} as HTMLElement;

    openCalendarEntry(
      { openDetailPanel } as any,
      view,
      {
        kind: 'row',
        id: 'database:row-1',
        sourceId: 'database',
        rowId: 'row-1',
        title: 'Doc',
        startAt: day('2026-05-15'),
        cardProperties: [],
        canResizeRange: false,
      },
      target
    );

    expect(openDetailPanel).toHaveBeenCalledWith(
      expect.objectContaining({ view, rowId: 'row-1' })
    );
  });
});

describe('calendar view converts', () => {
  it('converts header/card semantics without date mapping', () => {
    const tableToCalendar = viewConverts.find(
      convert => convert.from === 'table' && convert.to === 'calendar'
    );
    const calendarToKanban = viewConverts.find(
      convert => convert.from === 'calendar' && convert.to === 'kanban'
    );
    const filter = { type: 'group', op: 'and', conditions: [] } as const;
    const sort = { columns: [] };
    const header = { titleColumn: 'title' };

    expect(tableToCalendar?.convert({ filter, sort, header } as any)).toEqual({
      filter,
      sort,
      card: { titleColumnId: 'title', visiblePropertyIds: [] },
    });
    expect(
      calendarToKanban?.convert({
        filter,
        sort,
        card: { titleColumnId: 'title', visiblePropertyIds: ['status'] },
        date: { startColumnId: 'date' },
      } as any)
    ).toEqual({ filter, sort, header });
  });
});

describe('calendar dnd payload', () => {
  it('reads calendar entry payloads from blocksuite dnd data', () => {
    expect(
      getCalendarDndEntity({
        bsEntity: { type: 'calendar-entry', entryId: 'database:row-1' },
      })
    ).toEqual({ type: 'calendar-entry', entryId: 'database:row-1' });
  });

  it('normalizes affine doc entities for future document drops', () => {
    expect(
      getCalendarDndEntity({
        entity: { type: 'doc', id: 'doc-1' },
      })
    ).toEqual({ type: 'doc', docId: 'doc-1' });
  });

  it('reads document payloads from blocksuite dnd data', () => {
    expect(
      getCalendarDndEntity({ bsEntity: { type: 'doc', docId: 'doc-1' } })
    ).toEqual({ type: 'doc', docId: 'doc-1' });
  });
});
