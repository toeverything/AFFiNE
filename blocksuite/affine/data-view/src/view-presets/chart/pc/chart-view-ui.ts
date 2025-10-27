import { computed, signal } from '@preact/signals-core';
import Chart from 'chart.js/auto';
import { css, html } from 'lit';
import { state } from 'lit/decorators.js';

import type { FilterGroup } from '../../../core/filter/types.js';
import { renderUniLit } from '../../../core/index.js';
import { DataViewUIBase } from '../../../core/view/data-view-base.js';
import type { ViewManager } from '../../../core/view-manager/view-manager.js';
import { DEFAULT_COLUMN_WIDTH } from '../../table/consts.js';
import { type TableViewData, tableViewModel } from '../../table/define.js';
import { tableViewStyle } from '../../table/pc/table-view-style.js';
import { TableViewUILogic } from '../../table/pc/table-view-ui-logic.js';
import { TableSingleView } from '../../table/table-view-manager.js';
import { chartContainerStyle } from '../styles.js';
import type { ChartViewUILogic } from './chart-view-ui-logic.js';

class DialogTableView extends TableSingleView {
  private readonly _data: ReturnType<typeof signal<TableViewData>>;
  override data$: ReturnType<typeof signal<TableViewData>>;
  override readonly$ = computed(() => true);

  constructor(manager: ViewManager, data: TableViewData) {
    super(manager, 'dialog-table');
    this._data = signal<TableViewData>(data);
    this.data$ = this._data;
  }

  override dataUpdate(
    updater: (data: TableViewData) => Partial<TableViewData>
  ): void {
    const cur = this._data.value;
    const updates = updater(cur);
    this._data.value = { ...cur, ...updates } as TableViewData;
  }
}

class DialogTableViewUILogic extends TableViewUILogic {
  override get headerWidget() {
    return undefined;
  }
}

/**
 * ChartViewUI is a LitElement that:
 * 1. Renders the header widget (if provided).
 * 2. Creates a <canvas> for Chart.js.
 * 3. On first update, draws the doughnut chart based on categoryCounts$.
 *
 * Below we:
 *  • Strip out any "Status" key from the labels array.
 *  • Set dataset.label = '' so no "Status" appears in the legend or accessibility text.
 *  • Use a custom plugin to draw long gray callout lines (≈ 25% longer than the outer radius).
 *  • Hide all built-in Chart.js data labels/tooltips that might include "Status".
 */
export class ChartViewUI extends DataViewUIBase<ChartViewUILogic> {
  static override styles = css`
    :host {
      //display: block;
      //box-sizing: border-box;
      //background-color: #121212; /* dark background like Notion */
    }

    /* This wrapper sits inside chartContainerStyle padding and centers the canvas */
    .chart-wrapper {
      width: 100%;
      max-width: 100%;
      position: relative; /* so child <canvas> can absolutely fill */
      margin: 0 auto;
    }

    .chart-wrapper.small {
      height: 300px;
      max-height: 300px;
    }

    .chart-wrapper.medium {
      height: 450px;
      max-height: 450px;
    }

    .chart-wrapper.large {
      height: 600px;
      max-height: 600px;
    }

    /* The <canvas> should fill the wrapper exactly */
    .chart-wrapper canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100% !important;
      height: 100% !important;
    }

    /* Custom tooltip element for external handler */
    .chart-tooltip {
      position: absolute;
      pointer-events: none;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      font-size: 12px;
      border-radius: 6px;
      padding: 6px 8px;
      line-height: 1.4;
      white-space: nowrap;
    }
    .chart-tooltip .title {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .chart-tooltip .color-box {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .chart-tooltip .divider {
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      margin: 4px 0;
    }
    .chart-tooltip .action {
      color: #ccc;
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.5);
    }

    dialog {
      border: none;
      border-radius: 8px;
      background: #000;
      color: #fff;
      padding: 0;
      min-width: 300px;
    }

    .dialog-content {
      padding: 16px;
      max-height: 60vh;
      overflow: auto;
      position: relative;
    }

    .dialog-content table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .dialog-content th,
    .dialog-content td {
      padding: 4px 8px;
      border-bottom: 1px solid #333;
      text-align: left;
    }

    .dialog-content h4 {
      margin-top: 0;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 15px;
      gap: 8px;
    }

    .dialog-content h1 {
      margin: 0 0 8px;
    }

    .dialog-content affine-database-column-stats {
      display: none;
    }

    .close-btn {
      background: none;
      border: none;
      color: #fff;
      font-size: 16px;
      cursor: pointer;
    }
  `;

  private canvasEl?: HTMLCanvasElement;
  private tooltipEl?: HTMLDivElement;
  private dialogEl?: HTMLDialogElement;
  private chartLabels: string[] = [];
  private lastDataValues: number[] = [];
  @state()
  private accessor selectedCategory: string | null = null;
  private dialogTable?: DialogTableView;
  private dialogLogic?: TableViewUILogic;

  override connectedCallback(): void {
    super.connectedCallback();
    // Let our logic know we're ready to receive updates
    this.logic.ui$.value = this;
  }

  override render() {
    // Get height setting for wrapper class
    const height = this.logic.view.data$.value?.height || 'Medium';
    const heightClass = height.toLowerCase();

    // If the user provided a header widget, render it above the chart
    return html`
      ${this.logic.root.config.headerWidget
        ? renderUniLit(this.logic.root.config.headerWidget, {
            dataViewLogic: this.logic,
          })
        : ''}
      <div class="${chartContainerStyle}">
        <div class="chart-wrapper ${heightClass}">
          <canvas id="chart-canvas"></canvas>
          <dialog id="data-dialog">
            ${this.selectedCategory ? this.renderDataDialog() : ''}
          </dialog>
        </div>
      </div>
    `;
  }

  override firstUpdated() {
    // Grab the <canvas> once the template is rendered to the DOM
    this.canvasEl = this.renderRoot.querySelector('#chart-canvas') as
      | HTMLCanvasElement
      | undefined;
    this.dialogEl = this.renderRoot.querySelector('#data-dialog') as
      | HTMLDialogElement
      | undefined;
    this.dialogEl?.addEventListener('close', this.closeDataDialog);
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

    // 1a) If "Status" is present as a key, strip it out entirely.
    //     (Sometimes an upstream data source will use "Status" as a category header.)
    if (rawLabels.includes('Status') && rawLabels.length > 1) {
      rawLabels = rawLabels.filter(lbl => lbl !== 'Status');
    }

    // 1b) Sort the data based on user preference
    const sortBy = this.logic.view.data$.value?.sortBy ?? 'count-high-low';
    let sortedData = rawLabels.map(label => ({
      label,
      count: rawMap[label] || 0,
    }));

    // Apply sorting
    switch (sortBy) {
      case 'status-asc':
        sortedData.sort((a, b) => a.label.localeCompare(b.label));
        break;
      case 'status-desc':
        sortedData.sort((a, b) => b.label.localeCompare(a.label));
        break;
      case 'count-low-high':
        sortedData.sort((a, b) => a.count - b.count);
        break;
      case 'count-high-low':
        sortedData.sort((a, b) => b.count - a.count);
        break;
      case 'manual':
      default:
        // Keep original order
        break;
    }

    // Build sorted arrays
    rawLabels = sortedData.map(item => item.label);
    const dataValues = sortedData.map(item => item.count);
    this.lastDataValues = dataValues.map(value =>
      Number.isFinite(value) ? value : 0
    );
    this.chartLabels = [...rawLabels];
    const total = dataValues.reduce((sum, v) => sum + v, 0);

    // 2) Destroy any existing chart so we can redraw
    if (this.logic.chartInstance) {
      this.logic.chartInstance.destroy();
      this.logic.chartInstance = null;
    }

    // 3) Build the "outer" display labels for callouts based on user preference
    const dataLabelMode =
      this.logic.view.data$.value?.dataLabels ?? 'Value (%)';
    const displayLabels = rawLabels.map((_label, idx) => {
      const count = dataValues[idx] || 0;
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';

      if (dataLabelMode === 'Value') {
        return `${count}`;
      } else if (dataLabelMode === 'Value (%)') {
        return `${count} (${pct}%)`;
      }
      return ''; // None
    });

    // 4) Pick a color palette based on user selection
    const colorScheme = this.logic.view.data$.value?.colorScheme ?? 'auto';
    const colorPalettes: Record<string, string[]> = {
      auto: [
        'rgb(75, 192, 192)', // teal
        'rgb(255, 205, 86)', // yellow
        'rgb(54, 162, 235)', // blue
        'rgb(255, 99, 132)', // red
        'rgb(97, 189, 142)', // greenish
        'rgb(255, 159, 64)', // orange
      ],
      colorful: [
        'rgb(255, 99, 132)',
        'rgb(54, 162, 235)',
        'rgb(255, 206, 86)',
        'rgb(75, 192, 192)',
        'rgb(153, 102, 255)',
        'rgb(255, 159, 64)',
      ],
      colorless: [
        'rgb(140, 140, 140)',
        'rgb(180, 180, 180)',
        'rgb(100, 100, 100)',
        'rgb(160, 160, 160)',
        'rgb(120, 120, 120)',
        'rgb(200, 200, 200)',
      ],
      blue: [
        'rgb(0, 123, 255)',
        'rgb(33, 150, 243)',
        'rgb(100, 181, 246)',
        'rgb(66, 165, 245)',
        'rgb(30, 136, 229)',
        'rgb(13, 71, 161)',
      ],
      green: [
        'rgb(76, 175, 80)',
        'rgb(139, 195, 74)',
        'rgb(104, 159, 56)',
        'rgb(67, 160, 71)',
        'rgb(46, 125, 50)',
        'rgb(27, 94, 32)',
      ],
      yellow: [
        'rgb(255, 235, 59)',
        'rgb(255, 193, 7)',
        'rgb(255, 152, 0)',
        'rgb(251, 140, 0)',
        'rgb(245, 124, 0)',
        'rgb(230, 81, 0)',
      ],
      purple: [
        'rgb(156, 39, 176)',
        'rgb(171, 71, 188)',
        'rgb(186, 104, 200)',
        'rgb(149, 117, 205)',
        'rgb(124, 77, 255)',
        'rgb(103, 58, 183)',
      ],
      teal: [
        'rgb(0, 150, 136)',
        'rgb(0, 188, 212)',
        'rgb(38, 198, 218)',
        'rgb(77, 208, 225)',
        'rgb(129, 212, 250)',
        'rgb(79, 195, 247)',
      ],
      orange: [
        'rgb(255, 152, 0)',
        'rgb(255, 167, 38)',
        'rgb(255, 183, 77)',
        'rgb(255, 193, 7)',
        'rgb(255, 160, 0)',
        'rgb(245, 124, 0)',
      ],
      pink: [
        'rgb(233, 30, 99)',
        'rgb(240, 98, 146)',
        'rgb(244, 143, 177)',
        'rgb(248, 187, 208)',
        'rgb(252, 228, 236)',
        'rgb(236, 64, 122)',
      ],
      red: [
        'rgb(244, 67, 54)',
        'rgb(239, 83, 80)',
        'rgb(229, 115, 115)',
        'rgb(239, 154, 154)',
        'rgb(255, 205, 210)',
        'rgb(198, 40, 40)',
      ],
    };
    const selectedPalette = colorPalettes[colorScheme] || colorPalettes.auto;
    const backgroundColor = rawLabels.map((_, idx) => {
      return selectedPalette[idx % selectedPalette.length];
    });

    // 5) Determine Chart.js "type" (we treat 'pie' as 'doughnut')
    const chartType = this.logic.view.data$.value?.chartType ?? 'pie';
    const isDoughnut = chartType === 'pie';
    const type = isDoughnut
      ? 'doughnut'
      : chartType === 'bar' ||
          chartType === 'horizontal-bar' ||
          chartType === 'stacked-bar'
        ? 'bar'
        : chartType === 'line'
          ? 'line'
          : 'bar';
    const isStacked = chartType === 'stacked-bar';
    const horizontal = chartType === 'horizontal-bar';

    //
    // ─── PLUGIN: Center Text ("13" + "Total") ─────────────────────────────────────────
    //
    const showValueInCenter =
      this.logic.view.data$.value?.showValueInCenter !== false;
    const centerTextPlugin = {
      id: 'center-text',
      afterDraw: (chart: Chart) => {
        if (!isDoughnut || !showValueInCenter) return;
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

        // "Total" label (12px, weight 400, white at 0.46 opacity)
        ctx.font = '400 12px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.46)';
        ctx.fillText('Total', centerX, centerY + 30);

        ctx.restore();
      },
    };

    //
    // ─── PLUGIN: Outer Callout Lines + Longer Labels ─────────────────────────────────
    //
    const dataLabels = this.logic.view.data$.value?.dataLabels ?? 'Value (%)';
    const outerLabelPlugin = {
      id: 'outer-labels',
      afterDraw: (chart: Chart) => {
        if (!isDoughnut || dataLabels === 'None') return;
        const meta = chart.getDatasetMeta(0);
        const ctx = chart.ctx;
        ctx.save();

        // Use Notion's faint‐white for label text: 12px, rgba(255,255,255,0.282)
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

          // The point on the doughnut's outer edge:
          const sx = props.x + Math.cos(angle) * props.outerRadius;
          const sy = props.y + Math.sin(angle) * props.outerRadius;

          // Now we extend ~25% farther out so that "7 – 53.8%" sits well away:
          const extension = props.outerRadius * 1.42;
          const ex = props.x + Math.cos(angle) * extension;
          const ey = props.y + Math.sin(angle) * extension;

          // Draw the gray line from (sx, sy) → (ex, ey)
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();

          // ----- Position the text "at" the tip of this line -----
          // Compute a small "push-out" along the same angle so the text does not
          // overlap the line itself. Adjust `labelPadding` as needed (e.g. 4px).
          const labelPadding = 4;
          const offsetX = Math.cos(angle) * labelPadding;
          const offsetY = Math.sin(angle) * labelPadding;

          // Determine horizontal alignment so text is always "outside":
          // If angle is on right half (cos(angle) > 0), left-align text;
          // if on left half (cos(angle) < 0), right-align text;
          if (Math.cos(angle) >= 0) {
            ctx.textAlign = 'left';
          } else {
            ctx.textAlign = 'right';
          }
          // Vertically center the text relative to the endpoint:
          ctx.textBaseline = 'middle';

          // Final draw of label, anchored at (ex + offsetX, ey + offsetY)
          ctx.fillText(displayLabels[index], ex + offsetX, ey + offsetY);
        });

        ctx.restore();
      },
    };

    //
    // ─── Instantiate Chart.js ───────────────────────────────────────────────────────
    //
    // For stacked bar, create multiple datasets (one per category)
    // For other charts, create single dataset
    const datasets = isStacked
      ? rawLabels.map((label, idx) => ({
          label: label,
          data: [dataValues[idx]],
          backgroundColor: backgroundColor[idx],
          borderWidth: 2,
        }))
      : [
          {
            // Setting `label: ''` ensures Chart.js never auto-prepends "Status" anywhere
            label: '',
            data: dataValues,
            backgroundColor,
            borderWidth: isDoughnut ? 1 : 2,
            ...(isDoughnut && {
              hoverOffset: 4,
              // Slightly smaller and thinner ring for doughnut charts
              cutout: '85%',
            }),
            ...(type === 'line' && {
              borderColor: backgroundColor,
              fill: false,
              tension: 0.1,
            }),
          },
        ];

    this.logic.chartInstance = new Chart(ctx, {
      type: type as any,
      data: {
        // For stacked bar, use a single label; for others, use category labels
        labels: isStacked ? ['Total'] : rawLabels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        onClick: this.handleChartClick,
        // Add scales configuration for bar and line charts
        scales:
          type === 'bar' || type === 'line'
            ? {
                x: {
                  stacked: isStacked,
                  grid: {
                    display: false,
                  },
                  ticks: {
                    color: 'rgba(255, 255, 255, 0.46)',
                  },
                },
                y: {
                  stacked: isStacked,
                  beginAtZero: true,
                  grid: {
                    color: 'rgba(255, 255, 255, 0.1)',
                  },
                  ticks: {
                    color: 'rgba(255, 255, 255, 0.46)',
                  },
                },
              }
            : {},
        layout: {
          // Doughnut charts need more padding for outer labels, bar/line charts need less
          padding: isDoughnut
            ? {
                top: 80,
                bottom: 12,
                left: 12,
                right: 12,
              }
            : {
                top: 20,
                bottom: 12,
                left: 12,
                right: 12,
              },
        },
        plugins: {
          // ─── Legend ───────────────────────────────────────────────────────────────
          legend: {
            display: this.logic.view.data$.value?.showLegend !== false,
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
                weight: 400 as const,
              },
              padding: 16, // space between items
              // Filter out empty labels for non-stacked charts
              filter: (item: any) => {
                return item.text !== '' && item.text != null;
              },
            },
          },

          // ─── Tooltip ─────────────────────────
          tooltip: {
            enabled: false,
            external: this.externalTooltipHandler,
          },
        },

        // ─── Disable ALL built-in "datalabels" (in case you had chartjs-plugin-datalabels) ───
        // This ensures no extra text (like "Status") is ever rendered automatically on each slice.
        // Only include if datalabels plugin is available
        ...(Chart.defaults.plugins?.datalabels !== undefined && {
          datalabels: {
            display: false,
          },
        }),
      },
      // Only include doughnut-specific plugins for pie charts
      plugins: isDoughnut ? [centerTextPlugin, outerLabelPlugin] : [],
    });
  }

  private getOrCreateTooltip(chart: Chart): HTMLDivElement {
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.className = 'chart-tooltip';
      chart.canvas.parentNode?.append?.(this.tooltipEl);
    }
    return this.tooltipEl;
  }

  // Custom external tooltip to mimic design
  private readonly externalTooltipHandler = (context: any) => {
    const { chart, tooltip } = context;
    const tooltipEl = this.getOrCreateTooltip(chart);

    if (tooltip.opacity === 0) {
      tooltipEl.style.opacity = '0';
      return;
    }

    const dataPoint = tooltip.dataPoints?.[0];
    if (!dataPoint) return;

    const datasetIndex = dataPoint.datasetIndex ?? 0;
    const dataIndex = dataPoint.dataIndex ?? 0;
    const dataset = chart.data.datasets?.[datasetIndex];
    const toNumber = (value: unknown): number => {
      if (typeof value === 'number') {
        return value;
      }
      if (value && typeof value === 'object') {
        const maybe =
          (value as { x?: unknown; y?: unknown }).x ??
          (value as { x?: unknown; y?: unknown }).y;
        return typeof maybe === 'number' ? maybe : 0;
      }
      return 0;
    };
    const dataEntry = dataset
      ? Array.isArray(dataset.data)
        ? dataset.data[dataIndex]
        : dataset.data
      : undefined;
    const countValue = toNumber(dataEntry);

    const total =
      this.lastDataValues.reduce(
        (sum, value) => (Number.isFinite(value) ? sum + value : sum),
        0
      ) || 0;
    const pct =
      total > 0 && Number.isFinite(countValue)
        ? ((countValue / total) * 100).toFixed(1)
        : '0.0';

    const datasetLabel =
      typeof dataset?.label === 'string' && dataset.label.length
        ? dataset.label
        : undefined;
    const indexLabel =
      this.chartLabels[dataIndex] ?? this.chartLabels[datasetIndex];
    const rawLabel = typeof dataPoint.label === 'string' ? dataPoint.label : '';
    const label =
      (rawLabel && rawLabel !== 'Total' ? rawLabel : undefined) ??
      datasetLabel ??
      indexLabel ??
      '';

    const datasetBg = dataPoint.dataset?.backgroundColor;
    let color: string | undefined;
    if (Array.isArray(datasetBg)) {
      color = datasetBg[dataPoint.dataIndex] as string | undefined;
    } else if (typeof datasetBg === 'string') {
      color = datasetBg;
    }
    if (
      !color &&
      typeof dataPoint.element?.options?.backgroundColor === 'string'
    ) {
      color = dataPoint.element?.options?.backgroundColor as string;
    }

    tooltipEl.innerHTML = `
            <div class="title"><span class="color-box" style="background:${color ?? 'var(--affine-icon-secondary)'}"></span>${label} ${countValue} (${pct}%)</div>
            <div class="divider"></div>
            <div class="action">Click to view data</div>
        `;

    const { offsetLeft: left, offsetTop: top } = chart.canvas;
    tooltipEl.style.opacity = '1';
    tooltipEl.style.left = left + tooltip.caretX + 'px';
    tooltipEl.style.top = top + tooltip.caretY + 'px';

    const action = tooltipEl.querySelector('.action') as HTMLElement | null;
    if (action) {
      action.onclick = () => {
        void this.openDataDialog(label).catch(console.error);
      };
    }
  };

  private async openDataDialog(category: string) {
    this.selectedCategory = category;
    const categoryId = this.logic.view.data$.value?.categoryPropertyId;
    if (!categoryId) return;

    if (!this.dialogTable) {
      const data = tableViewModel.model.defaultData(this.logic.view.manager);
      const props = this.logic.view.manager.dataSource.properties$.value;
      const tableData = {
        ...data,
        columns: props.map(id => ({ id, width: DEFAULT_COLUMN_WIDTH })),
      };
      this.dialogTable = new DialogTableView(
        this.logic.view.manager,
        tableData
      );
      this.dialogLogic = new DialogTableViewUILogic(
        this.logic.root,
        this.dialogTable
      );
    }

    const prop = this.logic.view.propertyGetOrCreate(categoryId);
    const parsed = prop.parseValueFromString(category);
    let filterFn = 'is';
    let filterValue: unknown = category;
    const type = prop.type$.value;

    if (parsed) {
      filterValue = parsed.value;
      if (type === 'select') {
        filterFn = 'isOneOf';
        filterValue = [parsed.value];
      } else if (type === 'multi-select') {
        filterFn = 'containsOneOf';
        filterValue = [parsed.value];
      }
    }

    const filter: FilterGroup = {
      type: 'group',
      op: 'and',
      conditions: [
        {
          type: 'filter',
          left: { type: 'ref', name: categoryId },
          function: filterFn,
          args: [{ type: 'literal', value: filterValue }],
        },
      ],
    };
    this.dialogTable.dataUpdate(() => ({ filter }));

    await this.updateComplete;
    if (!this.dialogEl) {
      this.dialogEl = this.renderRoot.querySelector('#data-dialog') as
        | HTMLDialogElement
        | undefined;
      this.dialogEl?.addEventListener('close', this.closeDataDialog);
    }
    this.dialogEl?.showModal();
  }

  private readonly closeDataDialog = () => {
    this.dialogEl = this.renderRoot.querySelector('#data-dialog') as
      | HTMLDialogElement
      | undefined;
    this.dialogEl?.close();
    this.selectedCategory = null;
    this.dialogTable = undefined;
    this.dialogLogic = undefined;
  };

  private renderDataDialog() {
    const categoryId = this.logic.view.data$.value?.categoryPropertyId;
    if (!categoryId || !this.selectedCategory) return html``;

    // Ensure the property exists
    this.logic.view.propertyGetOrCreate(categoryId);
    if (!this.dialogLogic) return html``;

    return html`
      <div class="dialog-content affine-database-table ${tableViewStyle}">
        <div class="dialog-header">
          <data-view-header-tools-search
            .dataViewLogic=${this.dialogLogic}
          ></data-view-header-tools-search>
          <button class="close-btn" @click=${this.closeDataDialog}>✕</button>
        </div>
        <h1>${this.selectedCategory}</h1>
        <dv-table-view-ui .logic=${this.dialogLogic}></dv-table-view-ui>
      </div>
    `;
  }

  private readonly handleChartClick = (_event: unknown, elements: any[]) => {
    if (!elements || elements.length === 0) return;
    const index = elements[0].index;
    const label = this.chartLabels[index];
    if (label) {
      void this.openDataDialog(label).catch(console.error);
    }
  };

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
