import { DataViewUILogicBase } from '../../../core/view/data-view-base.js';
import type { ChartSingleView } from '../chart-view-manager.js';
import { createUniComponentFromWebComponent } from '../../../core/utils/uni-component/uni-component.js';
import { signal } from '@preact/signals-core';
import { ChartViewUI } from './chart-view-ui.js';
import type { Chart } from 'chart.js';

/**
 * ChartViewUILogic bridges the view‐layer (ChartSingleView) and the UI (ChartViewUI).
 * We hold onto a reactive signal `ui$` so our controllers can mount custom elements,
 * and we keep `chartInstance` to manage Chart.js.
 */
export class ChartViewUILogic extends DataViewUILogicBase<ChartSingleView, unknown> {
    /** Holds the reference to the rendered ChartViewUI element. */
    ui$ = signal<ChartViewUI>();

    /** Once the chart is drawn, we keep this to update or destroy as needed. */
    chartInstance: Chart<'doughnut', number[], string> | null = null;

    /** The `render` function used by DataView to instantiate the UI. */
    renderer = createUniComponentFromWebComponent(ChartViewUI);

    /** Clean up the Chart instance when this logic is disposed. */
    onHostDisconnected(): void {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }

    clearSelection = () => {
        // no selection concept in chart view
    };

    addRow = () => {
        // chart view does not support adding rows
        return undefined;
    };

    focusFirstCell = () => {
        // nothing to focus in chart view
    };

    showIndicator = () => false;

    hideIndicator = () => {
        /* no-op */
    };

    moveTo = () => {
        /* no-op */
    };
}
