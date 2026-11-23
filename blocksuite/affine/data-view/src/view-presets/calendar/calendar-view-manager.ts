import { DocDisplayMetaProvider } from '@blocksuite/affine-shared/services';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { type DeltaInsert, Text } from '@blocksuite/store';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';
import { Doc } from 'yjs';

import { evalFilter } from '../../core/filter/eval.js';
import { generateDefaultValues } from '../../core/filter/generate-default-values.js';
import { FilterTrait, filterTraitKey } from '../../core/filter/trait.js';
import type { FilterGroup } from '../../core/filter/types.js';
import { emptyFilterGroup } from '../../core/filter/utils.js';
import { fromJson } from '../../core/property/utils';
import { SortManager, sortTraitKey } from '../../core/sort/manager.js';
import { PropertyBase } from '../../core/view-manager/property.js';
import { type Row, RowBase } from '../../core/view-manager/row.js';
import {
  type SingleView,
  SingleViewBase,
} from '../../core/view-manager/single-view.js';
import type { ViewManager } from '../../core/view-manager/view-manager.js';
import { getCalendarExternalSources } from './source.js';
import type {
  CalendarEntry,
  CalendarEntryRange,
  CalendarExternalEntry,
  CalendarExternalSource,
  CalendarRowEntry,
  CalendarStoredViewData,
  CalendarTitleSegment,
} from './types.js';

export type CalendarDateMapping =
  | {
      status: 'ready';
      propertyId: string;
    }
  | {
      status: 'setup';
      propertyId?: string;
    };

const getStartColumnId = (data?: CalendarStoredViewData) =>
  data?.date?.startColumnId;

const getEndColumnId = (data?: CalendarStoredViewData) => {
  return data?.date?.endColumnId;
};

const getDateData = (data: CalendarStoredViewData) => ({
  ...data.date,
  startColumnId: getStartColumnId(data),
});

const getCardData = (data?: CalendarStoredViewData) => {
  if (data) {
    return data.card;
  }
  return {
    visiblePropertyIds: [],
  };
};

const toTimestamp = (date: number | Date) =>
  date instanceof Date ? date.getTime() : date;

const isValidTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const createLinkedDocTitle = (docId: string) => {
  const text = new Text<AffineTextAttributes>();
  new Doc().getMap('root').set('text', text.yText);
  text.applyDelta([
    {
      insert: ' ',
      attributes: { reference: { type: 'LinkedPage', pageId: docId } },
    },
  ] satisfies DeltaInsert<AffineTextAttributes>[]);
  return text;
};

const getTitleDeltas = (value: unknown) =>
  typeof value === 'object' && value != null && 'deltas$' in value
    ? (value as { deltas$?: { value?: unknown } }).deltas$?.value
    : undefined;

const getTitleSegments = (
  value: unknown,
  title: string,
  getLinkedDocTitle?: (pageId: string, title?: string) => string | undefined
): CalendarTitleSegment[] | undefined => {
  const deltas = getTitleDeltas(value);
  if (!Array.isArray(deltas)) {
    return;
  }
  const segments = deltas.flatMap(delta => {
    const item = delta as {
      insert?: unknown;
      attributes?: {
        reference?: {
          type?: string;
          pageId?: unknown;
          title?: unknown;
        };
      };
    };
    const linkedDoc =
      item.attributes?.reference?.type === 'LinkedPage' &&
      typeof item.attributes.reference.pageId === 'string';
    const referenceTitle = item.attributes?.reference?.title;
    const resolvedLinkedDocTitle =
      linkedDoc && typeof item.attributes?.reference?.pageId === 'string'
        ? getLinkedDocTitle?.(
            item.attributes.reference.pageId,
            typeof referenceTitle === 'string' ? referenceTitle : undefined
          )
        : undefined;
    const text =
      resolvedLinkedDocTitle ||
      (linkedDoc && typeof referenceTitle === 'string' && referenceTitle
        ? referenceTitle
        : typeof item.insert === 'string'
          ? item.insert.trim()
          : '');
    if (linkedDoc) {
      return {
        text,
        linkedDoc,
      };
    }
    if (!text) {
      return [];
    }
    return {
      text,
    };
  });
  const normalizedSegments = segments.reduce<CalendarTitleSegment[]>(
    (result, segment) => {
      const previous = result.at(-1);
      if (
        previous?.linkedDoc &&
        !previous.text &&
        !segment.linkedDoc &&
        segment.text
      ) {
        previous.text = segment.text;
        return result;
      }
      result.push(segment);
      return result;
    },
    []
  );
  if (!normalizedSegments.some(segment => segment.linkedDoc)) {
    return;
  }
  if (!normalizedSegments.some(segment => segment.text)) {
    return title
      ? [...normalizedSegments, { text: title }]
      : normalizedSegments;
  }
  return normalizedSegments;
};

export class CalendarSingleView extends SingleViewBase<CalendarStoredViewData> {
  private readonly externalEntries$ = signal<CalendarExternalEntry[]>([]);

  private externalEntriesRequestId = 0;

  propertiesRaw$ = computed(() => {
    return this.dataSource.properties$.value.map(id =>
      this.propertyGetOrCreate(id)
    );
  });

  properties$ = this.propertiesRaw$;

  detailProperties$ = computed(() => {
    return this.propertiesRaw$.value.filter(
      property => property.type$.value !== 'title'
    );
  });

  private readonly filter$ = computed(() => {
    return this.data$.value?.filter ?? emptyFilterGroup;
  });

  private readonly sortList$ = computed(() => {
    return this.data$.value?.sort;
  });

  emptyMonthHintDismissed$ = computed(() => {
    return this.data$.value?.ui?.emptyMonthHintDismissed ?? false;
  });

  private readonly sortManager = this.traitSet(
    sortTraitKey,
    new SortManager(this.sortList$, this, {
      setSortList: sortList => {
        this.dataUpdate(data => ({
          sort: {
            ...data.sort,
            ...sortList,
          },
        }));
      },
    })
  );

  filterTrait = this.traitSet(
    filterTraitKey,
    new FilterTrait(this.filter$, this, {
      filterSet: (filter: FilterGroup) => {
        this.dataUpdate(() => ({ filter }));
      },
    })
  );

  mainProperties$ = computed(() => {
    const card = getCardData(this.data$.value);
    return {
      titleColumn:
        card.titleColumnId ??
        this.propertiesRaw$.value.find(
          property => property.type$.value === 'title'
        )?.id,
    };
  });

  readonly$ = computed(() => {
    return this.manager.readonly$.value;
  });

  dateProperties$ = computed(() => {
    return this.propertiesRaw$.value.filter(
      property => property.type$.value === 'date'
    );
  });

  dateMapping$: ReadonlySignal<CalendarDateMapping> = computed(() => {
    const propertyId = getStartColumnId(this.data$.value);
    if (
      propertyId &&
      this.dataSource.properties$.value.includes(propertyId) &&
      this.dataSource.propertyTypeGet(propertyId) === 'date'
    ) {
      return {
        status: 'ready',
        propertyId,
      };
    }
    return {
      status: 'setup',
      propertyId,
    };
  });

  startDateMapping$ = this.dateMapping$;

  endDateMapping$: ReadonlySignal<CalendarDateMapping> = computed(() => {
    const propertyId = getEndColumnId(this.data$.value);
    if (
      propertyId &&
      this.dataSource.properties$.value.includes(propertyId) &&
      this.dataSource.propertyTypeGet(propertyId) === 'date'
    ) {
      return {
        status: 'ready',
        propertyId,
      };
    }
    return {
      status: 'setup',
      propertyId,
    };
  });

  private readonly visibleCardProperties$ = computed(() => {
    const card = getCardData(this.data$.value);
    const visiblePropertyIds = card.visiblePropertyIds ?? [];
    const titleColumn = card.titleColumnId;
    return visiblePropertyIds
      .filter(propertyId => propertyId !== titleColumn)
      .map(propertyId => this.propertyGetOrCreate(propertyId));
  });

  rowEntries$ = computed<CalendarRowEntry[]>(() => {
    const mapping = this.dateMapping$.value;
    if (mapping.status !== 'ready') {
      return [];
    }
    const endMapping = this.endDateMapping$.value;
    return this.rows$.value.flatMap(row => {
      const startAt = this.cellGetOrCreate(row.rowId, mapping.propertyId)
        .jsonValue$.value;
      if (!isValidTimestamp(startAt)) {
        return [];
      }
      const endAt =
        endMapping.status === 'ready'
          ? this.cellGetOrCreate(row.rowId, endMapping.propertyId).jsonValue$
              .value
          : undefined;
      const titleColumn = this.mainProperties$.value.titleColumn ?? 'title';
      const titleCell = this.cellGetOrCreate(row.rowId, titleColumn);
      const jsonTitle = titleCell.jsonValue$.value;
      const title =
        (typeof jsonTitle === 'string'
          ? jsonTitle
          : titleCell.stringValue$.value) ?? '';
      const docDisplayMeta = this.manager.dataSource.serviceGet(
        DocDisplayMetaProvider
      );
      const resolveLinkedDocTitle = (pageId: string, title?: string) =>
        docDisplayMeta?.title(pageId, { title }).value;
      const titleSegments = getTitleSegments(
        titleCell.value$.value,
        title,
        resolveLinkedDocTitle
      );
      const cardProperties = this.visibleCardProperties$.value.flatMap(
        property => {
          const cell = this.cellGetOrCreate(row.rowId, property.id);
          const value = cell.stringValue$.value;
          if (!value) {
            return [];
          }
          return {
            propertyId: property.id,
            value,
          };
        }
      );
      return {
        kind: 'row',
        id: `database:${row.rowId}`,
        sourceId: 'database',
        rowId: row.rowId,
        title,
        startAt,
        endAt: isValidTimestamp(endAt) && endAt >= startAt ? endAt : undefined,
        titleSegments,
        cardProperties,
        canResizeRange: endMapping.status === 'ready' && !this.readonly$.value,
      } satisfies CalendarRowEntry;
    });
  });

  entries$ = computed<CalendarEntry[]>(() => {
    return [...this.rowEntries$.value, ...this.externalEntries$.value];
  });

  externalSources$ = computed<CalendarExternalSource[]>(() => {
    const viewData = this.data$.value;
    if (!viewData) {
      return [];
    }
    return getCalendarExternalSources(this.dataSource, viewData);
  });

  get type(): string {
    return this.data$.value?.mode ?? 'calendar';
  }

  constructor(viewManager: ViewManager, viewId: string) {
    super(viewManager, viewId);
  }

  isShow(rowId: string): boolean {
    if (this.filter$.value.conditions.length) {
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

  override rowsMapping(rows: Row[]) {
    return this.sortManager.sort(super.rowsMapping(rows));
  }

  propertyGetOrCreate(propertyId: string): CalendarProperty {
    return new CalendarProperty(this, propertyId);
  }

  override rowGetOrCreate(rowId: string): CalendarRow {
    return new CalendarRow(this, rowId);
  }

  setStartDateColumn(propertyId: string) {
    this.dataUpdate(data => ({
      date: {
        ...getDateData(data),
        startColumnId: propertyId,
      },
    }));
  }

  setDateColumn(propertyId: string) {
    this.setStartDateColumn(propertyId);
  }

  setEndDateColumn(propertyId: string | undefined) {
    this.dataUpdate(data => ({
      date: {
        ...getDateData(data),
        endColumnId: propertyId,
      },
    }));
  }

  setWorkspaceCalendarEnabled(enabled: boolean) {
    this.dataUpdate(data => ({
      sources: {
        ...data.sources,
        workspaceCalendar: {
          ...(data.sources?.workspaceCalendar ?? { enabled: true }),
          enabled,
        },
      },
    }));
  }

  setWorkspaceCalendarSubscriptionIds(subscriptionIds?: string[]) {
    this.dataUpdate(data => ({
      sources: {
        ...data.sources,
        workspaceCalendar: {
          ...(data.sources?.workspaceCalendar ?? { enabled: true }),
          subscriptionIds,
        },
      },
    }));
  }

  dismissEmptyMonthHint() {
    this.dataUpdate(data => ({
      ui: {
        ...data.ui,
        emptyMonthHintDismissed: true,
      },
    }));
  }

  getDocDisplayTitle(docId: string) {
    return (
      this.manager.dataSource.serviceGet(DocDisplayMetaProvider)?.title(docId)
        .value ?? 'Untitled'
    );
  }

  createStartDateColumn() {
    const id = this.propertyAdd('end', {
      type: 'date',
      name: 'Date',
    });
    if (id) {
      this.setStartDateColumn(id);
    }
    return id;
  }

  createDateColumn() {
    return this.createStartDateColumn();
  }

  createEndDateColumn() {
    const id = this.propertyAdd('end', {
      type: 'date',
      name: 'End Date',
    });
    if (id) {
      this.setEndDateColumn(id);
    }
    return id;
  }

  createRowOnDate(date: number | Date) {
    const mapping = this.startDateMapping$.value;
    if (mapping.status !== 'ready') {
      return;
    }
    const rowId = this.rowAdd('end');
    const filter = this.filter$.value;
    if (filter.conditions.length > 0) {
      const defaultValues = generateDefaultValues(filter, this.vars$.value);
      Object.entries(defaultValues).forEach(([propertyId, jsonValue]) => {
        const property = this.propertyGetOrCreate(propertyId);
        const propertyMeta = property.meta$.value;
        if (propertyMeta) {
          const value = fromJson(propertyMeta.config, {
            value: jsonValue,
            data: property.data$.value,
            dataSource: this.dataSource,
          });
          this.cellGetOrCreate(rowId, propertyId).valueSet(value);
        }
      });
    }
    this.cellGetOrCreate(rowId, mapping.propertyId).jsonValueSet(
      toTimestamp(date)
    );
    this.dismissEmptyMonthHint();
    return rowId;
  }

  createLinkedDocRowOnDate(date: number | Date, docId: string) {
    const rowId = this.createRowOnDate(date);
    if (!rowId) return;
    const titleColumn = this.mainProperties$.value.titleColumn ?? 'title';
    this.cellGetOrCreate(rowId, titleColumn).valueSet(
      createLinkedDocTitle(docId)
    );
    return rowId;
  }

  moveRowToDate(rowId: string, date: number | Date) {
    const mapping = this.startDateMapping$.value;
    if (mapping.status !== 'ready') {
      return;
    }
    const value = toTimestamp(date);
    const oldStartAt = this.cellGetOrCreate(rowId, mapping.propertyId)
      .jsonValue$.value;
    const endMapping = this.endDateMapping$.value;
    if (endMapping.status === 'ready' && isValidTimestamp(oldStartAt)) {
      const oldEndAt = this.cellGetOrCreate(rowId, endMapping.propertyId)
        .jsonValue$.value;
      if (isValidTimestamp(oldEndAt) && oldEndAt >= oldStartAt) {
        this.cellGetOrCreate(rowId, endMapping.propertyId).jsonValueSet(
          value + (oldEndAt - oldStartAt)
        );
      }
    }
    this.cellGetOrCreate(rowId, mapping.propertyId).jsonValueSet(value);
  }

  resizeRowRange(rowId: string, edge: 'start' | 'end', date: number | Date) {
    const startMapping = this.startDateMapping$.value;
    const endMapping = this.endDateMapping$.value;
    if (startMapping.status !== 'ready' || endMapping.status !== 'ready') {
      return;
    }
    const startCell = this.cellGetOrCreate(rowId, startMapping.propertyId);
    const endCell = this.cellGetOrCreate(rowId, endMapping.propertyId);
    const startAt = startCell.jsonValue$.value;
    const endAt = endCell.jsonValue$.value;
    if (!isValidTimestamp(startAt) || !isValidTimestamp(endAt)) {
      return;
    }
    const value = toTimestamp(date);
    if (edge === 'start') {
      startCell.jsonValueSet(Math.min(value, endAt));
    } else {
      endCell.jsonValueSet(Math.max(value, startAt));
    }
  }

  async loadExternalEntries(range: CalendarEntryRange) {
    const requestId = ++this.externalEntriesRequestId;
    const viewData = this.data$.value;
    if (!viewData) {
      this.externalEntries$.value = [];
      return [];
    }
    const results = await Promise.allSettled(
      this.externalSources$.value.map(source =>
        Promise.resolve(source.getEntries(range))
      )
    );
    const entries = results.flatMap(result =>
      result.status === 'fulfilled' ? result.value : []
    );
    if (requestId === this.externalEntriesRequestId) {
      this.externalEntries$.value = entries;
    }
    return entries;
  }
}

export class CalendarProperty extends PropertyBase {
  hide$ = computed(() => false);

  constructor(view: CalendarSingleView, propertyId: string) {
    super(view as SingleView, propertyId);
  }

  hideSet(_hide: boolean): void {}

  move(_position: InsertToPosition): void {}
}

export class CalendarRow extends RowBase {
  constructor(
    readonly calendarView: CalendarSingleView,
    rowId: string
  ) {
    super(calendarView, rowId);
  }
}
