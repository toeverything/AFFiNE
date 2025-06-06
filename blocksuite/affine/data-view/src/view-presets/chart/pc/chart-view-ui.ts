// File: blocksuite/affine/data-view/src/view-presets/chart/pc/chart-view-ui.ts

import { DataViewUIBase } from '../../../core/view/data-view-base.js';
import type { ChartViewUILogic } from './chart-view-ui-logic.js';
import { html, css, LitElement } from 'lit';
import { renderUniLit } from '../../../core/index.js';
import Chart from 'chart.js/auto';
import { chartContainerStyle } from '../styles.js';

/**
 * ChartViewUI is a LitElement that:
 * 1. Renders the header widget (if provided).
 * 2. Creates a <canvas> for Chart.js.
 * 3. On first update, draws the doughnut chart based on categoryCounts$.
 *
 * Below we:
 *  • Strip out any “Status” key from the labels array.
 *  • Set dataset.label = '' so no “Status” appears in the legend or accessibility text.
 *  • Use a custom plugin to draw long gray callout lines (≈ 25% longer than the outer radius).
 *  • Hide all built-in Chart.js data labels/tooltips that might include “Status”.
 */
export class ChartViewUI extends DataViewUIBase<ChartViewUILogic> {
    static override styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      background-color: #121212; /* dark background like Notion */
    }

    /* This wrapper sits inside chartContainerStyle padding and centers the canvas */
    .chart-wrapper {
      width: 100%;
      max-width: 600px;
      height: 400px;          /* give it a fixed height so the doughnut is never squished */
      position: relative;     /* so child <canvas> can absolutely fill */
    }

    /* The <canvas> should fill the wrapper exactly */
    .chart-wrapper canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%  !important;
      height: 100% !important;
    }
  `;

    private canvasEl?: HTMLCanvasElement;

    override connectedCallback(): void {
        super.connectedCallback();
        // Let our logic know we’re ready to receive updates
        this.logic.ui$.value = this;
    }

    override render() {
        // If the user provided a header widget, render it above the chart
        return html`
      ${this.logic.root.config.headerWidget
                ? renderUniLit(this.logic.root.config.headerWidget, {
                    dataViewLogic: this.logic,
                })
                : ''}
      <div class="${chartContainerStyle}">
        <div class="chart-wrapper">
          <canvas id="chart-canvas"></canvas>
        </div>
      </div>
    `;
    }

    override firstUpdated() {
        // Grab the <canvas> once the template is rendered to the DOM
        this.canvasEl = this.renderRoot.querySelector(
            '#chart-canvas'
        ) as HTMLCanvasElement | undefined;
        this.createOrUpdateChart();
    }

    /**
     * Whenever categoryCounts$ changes, rebuild the chart.
     */
    private createOrUpdateChart() {
        if (!this.canvasEl) return;
        const ctx = this.canvasEl.getContext('2d');
        if (!ctx) return;

        // 1) Retrieve the raw counts & labels from logic
        const rawMap = this.logic.view.categoryCounts$.value; // e.g. { TODO: 7, 'In Progress': 3, Complete: 2, DNF: 1 }
        let rawLabels = Object.keys(rawMap);

        // 1a) If “Status” is present as a key, strip it out entirely.
        //     (Sometimes an upstream data source will use “Status” as a category header.)
        if (rawLabels.includes('Status') && rawLabels.length > 1) {
            rawLabels = rawLabels.filter((lbl) => lbl !== 'Status');
        }

        // 1b) Now build the cleaned counts array in the same order
        const dataValues = rawLabels.map((lbl) => rawMap[lbl]);
        const total = dataValues.reduce((sum, v) => sum + v, 0);

        // 2) Destroy any existing chart so we can redraw
        if (this.logic.chartInstance) {
            this.logic.chartInstance.destroy();
            this.logic.chartInstance = null;
        }

        // 3) Build the “outer” display labels for callouts, e.g. “TODO (7 – 53.8%)”
        const displayLabels = rawLabels.map((label, idx) => {
            const count = dataValues[idx];
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
            return `${label} (${count} – ${pct}%)`;
        });

        // 4) Pick a color palette (cycle if more categories exist)
        const defaultColors = [
            'rgb(75, 192, 192)',   // teal
            'rgb(255, 205, 86)',   // yellow
            'rgb(54, 162, 235)',   // blue
            'rgb(255, 99, 132)',   // red
            'rgb(97, 189, 142)',   // greenish
            'rgb(255, 159, 64)',   // orange
        ];
        const backgroundColor = rawLabels.map((_, idx) => {
            return defaultColors[idx % defaultColors.length];
        });

        // 5) Determine Chart.js “type” (we treat 'pie' as 'doughnut')
        const chartType = this.logic.view.data$.value?.chartType ?? 'pie';
        const isDoughnut = chartType === 'pie';
        const type = isDoughnut
            ? 'doughnut'
            : chartType === 'vertical-bar' || chartType === 'horizontal-bar'
                ? 'bar'
                : chartType === 'line'
                    ? 'line'
                    : 'bar';
        const horizontal = chartType === 'horizontal-bar';

        //
        // ─── PLUGIN: Center Text (“13” + “Total”) ─────────────────────────────────────────
        //
        const centerTextPlugin = {
            id: 'center-text',
            afterDraw: (chart: Chart) => {
                if (chart.config.type !== 'doughnut') return;
                const {
                    ctx,
                    chartArea: { left, top, width, height },
                } = chart;
                ctx.save();

                const centerX = left + width / 2;
                const centerY = top + height / 2;

                // Large number (62px, weight 500, white at 0.81 opacity)
                ctx.font = '500 62px sans-serif';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.81)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(total), centerX, centerY - 12);

                // “Total” label (12px, weight 400, white at 0.46 opacity)
                ctx.font = '400 12px sans-serif';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.46)';
                ctx.fillText('Total', centerX, centerY + 30);

                ctx.restore();
            },
        };

        //
        // ─── PLUGIN: Outer Callout Lines + Longer Labels ─────────────────────────────────
        //
        const outerLabelPlugin = {
            id: 'outer-labels',
            afterDraw: (chart: Chart) => {
                if (chart.config.type !== 'doughnut') return;
                const meta = chart.getDatasetMeta(0);
                const ctx = chart.ctx;
                ctx.save();

                // Use Notion’s faint‐white for label text: 12px, rgba(255,255,255,0.282)
                ctx.font = '12px sans-serif';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.282)';

                // The callout line itself is dark gray: rgba(55,55,55,1)
                ctx.strokeStyle = 'rgba(55, 55, 55, 1)';
                ctx.lineWidth = 1;

                meta.data.forEach((arc: any, index: number) => {
                    // Pull out x, y, startAngle, endAngle, outerRadius
                    const props = arc.getProps(
                        ['x', 'y', 'startAngle', 'endAngle', 'outerRadius'],
                        true
                    );
                    const angle = (props.startAngle + props.endAngle) / 2;

                    // The point on the doughnut’s outer edge:
                    const sx = props.x + Math.cos(angle) * props.outerRadius;
                    const sy = props.y + Math.sin(angle) * props.outerRadius;

                    // Now we extend ~25% farther out so that “7 – 53.8%” sits well away:
                    const extension = props.outerRadius * 1.25;
                    const ex = props.x + Math.cos(angle) * extension;
                    const ey = props.y + Math.sin(angle) * extension;

                    // Draw the gray line from (sx, sy) → (ex, ey)
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(ex, ey);
                    ctx.stroke();

                    // Finally, draw the dynamic text label just above the endpoint:
                    // e.g. “TODO (7 – 53.8%)”
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(displayLabels[index], ex, ey - 6);
                });

                ctx.restore();
            },
        };

        //
        // ─── Instantiate Chart.js ───────────────────────────────────────────────────────
        //
        this.logic.chartInstance = new Chart(ctx, {
            type,
            data: {
                // **IMPORTANT**: We explicitly set `labels: rawLabels` so that the bottom legend
                // only shows “Complete”, “In Progress”, “TODO”, “DNF”, etc. (No “Status”).
                labels: rawLabels,
                datasets: [
                    {
                        // Setting `label: ''` ensures Chart.js never auto-prepends “Status” anywhere
                        label: '',
                        data: dataValues,
                        backgroundColor,
                        borderWidth: 0,
                        hoverOffset: 4,
                        // Outer radius = 70% – 80% works well; here we choose 75%
                        radius: '75%',
                        // Inner cutout = 75% so that the ring is neither too thin nor too thick
                        cutout: '75%',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: horizontal ? 'y' : 'x',
                layout: {
                    // Keep a little padding but not so much that it looks “squished”
                    padding: {
                        top: 12,
                        bottom: 12,
                        left: 12,
                        right: 12,
                    },
                },
                plugins: {
                    // ─── Legend ───────────────────────────────────────────────────────────────
                    legend: {
                        position: 'bottom',
                        labels: {
                            // Tiny 8×8 rounded box (rx=2)
                            boxWidth: 8,
                            boxHeight: 8,
                            borderRadius: 2,
                            boxBorderColor: 'transparent',
                            // Legend text = 12px, rgba(255,255,255,0.46)
                            color: 'rgba(255, 255, 255, 0.46)',
                            font: {
                                size: 12,
                                weight: '400',
                            },
                            padding: 16, // space between items
                        },
                    },

                    // ─── Tooltip ───────────────────────────────────────────────────────────────
                    tooltip: {
                        enabled: true,
                        callbacks: {
                            label: (ctx) => {
                                const count = ctx.parsed as number;
                                const pct =
                                    total > 0
                                        ? ((count / total) * 100).toFixed(1)
                                        : '0.0';
                                const rawLabel = rawLabels[ctx.dataIndex];
                                return `${rawLabel}: ${count} (${pct}%)`;
                            },
                        },
                        backgroundColor: '#222',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                    },
                },

                // ─── Disable ALL built-in “datalabels” (in case you had chartjs-plugin-datalabels) ───
                // This ensures no extra text (like “Status”) is ever rendered automatically on each slice.
                datalabels: {
                    display: false,
                } as any, // cast to any if you haven’t installed chartjs-plugin-datalabels
            },
            plugins: [centerTextPlugin, outerLabelPlugin],
        });
    }

    override updated(changedProps: Map<string, unknown>) {
        super.updated(changedProps);
        // Whenever new data arrives, re-draw the chart
        this.createOrUpdateChart();
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'dv-chart-view-ui': ChartViewUI;
    }
}
