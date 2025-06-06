import { computed, type ReadonlySignal } from '@preact/signals-core';
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { SingleViewBase } from '../../core/view-manager/single-view.js';
import type { ViewManager } from '../../core/view-manager/view-manager.js';
import type { ChartViewData } from './define.js';
import type { Cell } from '../../core/view-manager/cell.js';
import { PropertyBase } from '../../core/view-manager/property.js';


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
    readonly categoryCounts$: ReadonlySignal<Record<string, number>> = computed(() => {
        const data = this.data$.value;
        const categoryProp = data?.categoryPropertyId;
        if (!categoryProp) {
            return {}; // no category property selected → no data
        }

        // Get all existing rows in this view
        const rows = this.rows$.value; // array of Row objects
        const counts: Record<string, number> = {};

        rows.forEach(row => {
            // For each row, get/create the cell in the chosen property
            const cell: Cell = this.cellGetOrCreate(row.rowId, categoryProp);
            // Use the string value so Select/Multi-select show their tag names
            const raw = cell.stringValue$.value as unknown;
            const category = typeof raw === 'string' && raw.length > 0 ? raw : 'Undefined';
            counts[category] = (counts[category] || 0) + 1;
        });

        return counts;
    });

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
        titleColumn: this.propertiesRaw$.value.find(p => p.type$.value === 'title')?.id,
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

    constructor(readonly chartView: ChartSingleView, propertyId: string) {
        super(chartView, propertyId);
    }
}
