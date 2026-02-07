import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { computed, type ReadonlySignal } from '@preact/signals-core';

import type { Cell } from '../../core/view-manager/cell.js';
import { PropertyBase } from '../../core/view-manager/property.js';
import { SingleViewBase } from '../../core/view-manager/single-view.js';
import type { ViewManager } from '../../core/view-manager/view-manager.js';
import type { ChartViewData } from './define.js';

/**
 * ChartSingleView manages the “Chart View” data. It computes, in a reactive
 * signal, a mapping from each category value to its row‐count.
 */
export class ChartSingleView extends SingleViewBase<ChartViewData> {
  /**
   * categoryCounts$ is a computed signal that returns an object:
   *   { [categoryValue: string]: number }
   * For each row in the datasource, it reads the display string of
   * `categoryPropertyId` and increments the corresponding count. Using the
   * string value ensures select properties use their tag names.
   */
  private readonly categoryInsights$ = computed(() => {
    const data = this.data$.value;
    const categoryProp = data?.categoryPropertyId;
    if (!categoryProp) {
      return {
        counts: {} as Record<string, number>,
        rawValues: {} as Record<string, unknown>,
        rowIds: {} as Record<string, string[]>,
        propertyType: undefined as string | undefined,
      };
    }

    const rows = this.rows$.value;
    const counts: Record<string, number> = {};
    const rawValues: Record<string, unknown> = {};
    const rowIds: Record<string, string[]> = {};

    rows.forEach(row => {
      const cell: Cell = this.cellGetOrCreate(row.rowId, categoryProp);
      const rawString = cell.stringValue$.value as unknown;
      const category =
        typeof rawString === 'string' && rawString.trim().length > 0
          ? rawString.trim()
          : undefined;
      if (!category) {
        return;
      }
      counts[category] = (counts[category] || 0) + 1;
      if (!(category in rawValues)) {
        rawValues[category] = cell.value$.value;
      }
      if (!rowIds[category]) {
        rowIds[category] = [];
      }
      rowIds[category].push(row.rowId);
    });

    const propertyType = this.propertyGetOrCreate(categoryProp).type$.value as
      | string
      | undefined;

    return {
      counts,
      rawValues,
      rowIds,
      propertyType,
    };
  });

  readonly categoryCounts$: ReadonlySignal<Record<string, number>> = computed(
    () => this.categoryInsights$.value.counts
  );

  readonly categoryRawValues$: ReadonlySignal<Record<string, unknown>> =
    computed(() => this.categoryInsights$.value.rawValues);

  readonly categoryRowIds$: ReadonlySignal<Record<string, string[]>> = computed(
    () => this.categoryInsights$.value.rowIds
  );

  readonly categoryPropertyType$: ReadonlySignal<string | undefined> = computed(
    () => this.categoryInsights$.value.propertyType
  );

  /**
   * Overrides propertyGetOrCreate only if you need custom Property handling.
   * For Chart, we only group by an existing property; we do not need extra property logic.
   */
  override propertyGetOrCreate(propertyId: string): ChartProperty {
    return new ChartProperty(this, propertyId);
  }

  /** Raw property list simply mirrors all datasource properties. */
  readonly propertiesRaw$ = computed(() => {
    return this.dataSource.properties$.value.map(id =>
      this.propertyGetOrCreate(id)
    );
  });

  /** All properties are visible in Chart view. */
  readonly properties$ = computed(() => this.propertiesRaw$.value);

  /** No extra detail properties beyond the normal list. */
  readonly detailProperties$ = computed(() => this.properties$.value);

  /** Title/icon columns follow the datasource defaults. */
  readonly mainProperties$ = computed(() => ({
    titleColumn: this.propertiesRaw$.value.find(p => p.type$.value === 'title')
      ?.id,
    iconColumn: 'type',
  }));

  /** Chart view respects the datasource readonly state. */
  readonly readonly$ = computed(() => this.manager.readonly$.value);

  /**
   * The view mode string identifying this view type.
   * If the backing data is missing we still return 'chart'.
   */
  override get type(): string {
    return this.data$.value?.mode ?? 'chart';
  }

  /** Display all rows. */
  isShow(_rowId: string): boolean {
    return true;
  }

  constructor(viewManager: ViewManager, viewId: string) {
    super(viewManager, viewId);
  }
}

/** Minimal property representation for Chart view. */
export class ChartProperty extends PropertyBase {
  /** Chart view does not support hiding columns; always visible. */
  hide$ = computed(() => false);

  /** Hiding is ignored as properties are always visible. */
  override hideSet(_hide: boolean): void {
    // no-op
  }

  /**
   * Chart view doesn\'t maintain its own ordering, so move() is a noop.
   * @param _position - Unused insert position.
   */
  override move(_position: InsertToPosition): void {
    // no-op
  }

  constructor(
    readonly chartView: ChartSingleView,
    propertyId: string
  ) {
    super(chartView, propertyId);
  }
}
