// AFFiNE/blocksuite/affine/data-view/src/view-presets/chart/pc/chart-view-ui.ts

import { DataViewUIBase } from '../../../core/view/data-view-base.js';
import type { ChartViewUILogic } from './chart-view-ui-logic.js';
import { html, css, LitElement } from 'lit';
import { renderUniLit } from '../../../core/index.js';
import Chart from 'chart.js/auto';
import { styleMap } from 'lit/directives/style-map.js';
import { chartContainerStyle } from '../styles.js';

/**
 * ChartViewUI is a LitElement that:
 * 1. Renders the header widget (if provided by the DataView configuration).
 * 2. Creates a <canvas> element for Chart.js.
 * 3. On first update, builds the doughnut chart based on categoryCounts$.
 */
export class ChartViewUI extends DataViewUIBase<ChartViewUILogic> {
    static override styles = css`
    :host {
      display: block;
      box-sizing: border-box;
    }
    .chart-wrapper {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
    }
    canvas {
      width: 100% !important;
      height: auto !important;
    }
  `;

    private canvasEl?: HTMLCanvasElement;

    override connectedCallback(): void {
        super.connectedCallback();
        // Tell logic we are now connected
        this.logic.ui$.value = this;
    }

    override render() {
        // Include the header widget, then render a canvas inside a wrapper div
        return html`
      ${this.logic.root.config.headerWidget
                ? renderUniLit(this.logic.root.config.headerWidget, {
                    dataViewLogic: this.logic,
                })
                : ''}
      <div class="${chartContainerStyle} chart-wrapper">
        <canvas id="chart-canvas"></canvas>
      </div>
    `;
    }

    override firstUpdated() {
        // Grab the <canvas> once the template has been stamped to the DOM
        this.canvasEl = this.renderRoot.querySelector('#chart-canvas') as HTMLCanvasElement | undefined;
        this.createOrUpdateChart();
    }

    /**
     * Whenever categoryCounts$ changes, we re-draw the chart. We also call this
     * once on firstUpdated() to draw the initial chart.
     */
    private createOrUpdateChart() {
        if (!this.canvasEl) return;
        const ctx = this.canvasEl.getContext('2d');
        if (!ctx) return;

        // Get the counts map from the logic’s view (a computed signal)
        const counts = this.logic.view.categoryCounts$.value;
        const labels = Object.keys(counts);
        const dataValues = labels.map(key => counts[key]);
        const total = dataValues.reduce((a, b) => a + b, 0);

        // If a chart already exists, destroy it before creating a new one
        if (this.logic.chartInstance) {
            this.logic.chartInstance.destroy();
            this.logic.chartInstance = null;
        }

        // Build human-readable labels like "TODO (7 – 46.7%)"
        const displayLabels = labels.map((label, idx) => {
            const count = dataValues[idx];
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
            return `${label} (${count} – ${pct}%)`;
        });

        // Pick a set of default colors (you can expand this array if you have more categories)
        const defaultColors = [
            'rgb(75, 192, 192)',   // teal
            'rgb(255, 205, 86)',    // yellow
            'rgb(54, 162, 235)',    // blue
            'rgb(255, 99, 132)',    // red
            'rgb(153, 102, 255)',   // purple
            'rgb(255, 159, 64)',    // orange
        ];
        // Assign each slice a color, cycling if there are more labels than colors
        const backgroundColor = labels.map((_, idx) => {
            return defaultColors[idx % defaultColors.length];
        });

        // Instantiate Chart.js
        this.logic.chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: displayLabels,
                datasets: [
                    {
                        data: dataValues,
                        backgroundColor,
                        borderWidth: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            boxHeight: 12,
                        },
                    },
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const count = context.parsed as number;
                                const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                                const rawLabel = labels[context.dataIndex];
                                return `${rawLabel}: ${count} (${pct}%)`;
                            },
                        },
                    },
                },
            },
        });
    }

    /**
     * If the reactive signal categoryCounts$ changes at runtime,
     * we want to update the chart. We can watch that signal here.
     */
    override updated(changedProps: Map<string, unknown>) {
        super.updated(changedProps);
        // Whenever we know data has changed, rebuild the chart
        this.createOrUpdateChart();
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'dv-chart-view-ui': ChartViewUI;
    }
}
