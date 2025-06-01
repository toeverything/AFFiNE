// AFFiNE/blocksuite/affine/data-view/src/view-presets/chart/chart-view-manager.ts

import { computed, type ReadonlySignal } from '@preact/signals-core';
import { SingleViewBase } from '../../core/view-manager/single-view.js';
import type { ViewManager } from '../../core/view-manager/view-manager.js';
import type { ChartViewData } from './define.js';
import type { Cell } from '../../core/view-manager/cell.js';

/**
 * ChartSingleView manages the “Chart View” data. It computes, in a reactive
 * signal, a mapping from each category value to its row‐count.
 */
export class ChartSingleView extends SingleViewBase<ChartViewData> {
    /**
     * categoryCounts$ is a computed signal that returns an object:
     *   { [categoryValue: string]: number }
     * For each row in the datasource, it reads the cell value of
     * `categoryPropertyId` and increments the corresponding count.
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
            // We assume the cell’s JSON value is a string (e.g. “TODO” or “Complete”)
            const raw = cell.jsonValue$.value as unknown;
            const category = typeof raw === 'string' && raw.length > 0 ? raw : 'Undefined';
            counts[category] = (counts[category] || 0) + 1;
        });

        return counts;
    });

    /**
     * Overrides propertyGetOrCreate only if you need custom Property handling.
     * For Chart, we only group by an existing property; we do not need extra property logic.
     */
    override propertyGetOrCreate(propertyId: string) {
        return super.propertyGetOrCreate(propertyId);
    }

    constructor(viewManager: ViewManager, viewId: string) {
        super(viewManager, viewId);
    }
}
