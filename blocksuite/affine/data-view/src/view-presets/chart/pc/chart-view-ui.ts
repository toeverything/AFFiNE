import { computed, signal } from '@preact/signals-core';
import Chart from 'chart.js/auto';
import { css, html, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { DataViewRootUILogic } from '../../../core/data-view.js';
import type { FilterGroup } from '../../../core/filter/types.js';
import { renderUniLit } from '../../../core/index.js';
import { DataViewUIBase } from '../../../core/view/data-view-base.js';
import type { ViewManager } from '../../../core/view-manager/view-manager.js';
import { DEFAULT_COLUMN_WIDTH } from '../../table/consts.js';
import { type TableViewData, tableViewModel } from '../../table/define.js';
import { tableViewStyle } from '../../table/pc/table-view-style.js';
import { TableViewUILogic } from '../../table/pc/table-view-ui-logic.js';
import { TableSingleView } from '../../table/table-view-manager.js';
import { ChartProperty } from '../chart-view-manager.js';
import { chartContainerStyle } from '../styles.js';
import type { ChartViewUILogic } from './chart-view-ui-logic.js';

class DialogTableView extends TableSingleView {
  private readonly _data: ReturnType<typeof signal<TableViewData>>;
  override data$: ReturnType<typeof signal<TableViewData>>;
  private readonly visibleRowIds$ = signal<Set<string> | undefined>(undefined);

  // Force read-only mode: no edits, no meatball menu, no add row
  override readonly$ = computed(() => true);

  constructor(manager: ViewManager, data: TableViewData) {
    super(manager, 'dialog-table');
    this._data = signal<TableViewData>(data);
    this.data$ = this._data;
  }

  setVisibleRowIds(rowIds?: string[]) {
    this.visibleRowIds$.value = rowIds ? new Set(rowIds) : undefined;
  }

  override dataUpdate(
    updater: (data: TableViewData) => Partial<TableViewData>
  ): void {
    const cur = this._data.value;
    if (!cur) return;
    const updates = updater(cur);
    this._data.value = { ...cur, ...updates } as TableViewData;
  }

  override isShow(rowId: string): boolean {
    const visibleRowIds = this.visibleRowIds$.value;
    if (visibleRowIds && !visibleRowIds.has(rowId)) {
      return false;
    }
    return super.isShow(rowId);
  }
}

type DetailStateCallbacks = {
  beforeOpen?: () => void;
  afterClose?: () => void;
};

class DialogTableViewUILogic extends TableViewUILogic {
  constructor(
    root: DataViewRootUILogic,
    view: DialogTableView,
    private readonly detailCallbacks: DetailStateCallbacks = {}
  ) {
    super(root, view);
  }

  override get headerWidget() {
    return undefined;
  }

  override onBeforeOpenRowDetail(_rowId: string): void {
    if (!this.root.config.detailPanelConfig.openDetailPanel) {
      return;
    }
    this.detailCallbacks.beforeOpen?.();
  }

  override onAfterCloseRowDetail(_rowId: string): void {
    if (!this.root.config.detailPanelConfig.openDetailPanel) {
      return;
    }
    this.detailCallbacks.afterClose?.();
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
      margin: 0;
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

    .chart-wrapper.align-center {
      margin: 0 auto;
    }

    .chart-wrapper.align-left {
      margin-left: 0;
      margin-right: auto;
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
      pointer-events: auto;
      cursor: pointer;
    }

    .chart-caption {
      margin-top: 12px;
      font-size: 12px;
      line-height: 20px;
      color: var(--affine-text-secondary-color);
      white-space: pre-wrap;
    }

    .chart-caption.chart-caption--below-chart {
      margin-left: auto;
      margin-right: auto;
      text-align: center;
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
      z-index: 10;
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
  private dialogIsModal = false;
  private suppressDialogCloseCleanup = false;

  private readonly setDialogDetailOverlayState = (active: boolean) => {
    if (!this.dialogEl || !this.dialogEl.isConnected) {
      this.dialogEl = this.renderRoot.querySelector('#data-dialog') as
        | HTMLDialogElement
        | undefined;
    }
    if (!this.dialogEl) {
      return;
    }
    this.dialogEl.classList.toggle('detail-overlay-active', active);
    if (active) {
      this.dialogEl.setAttribute('aria-hidden', 'true');
      this.dialogEl.style.pointerEvents = 'none';
      this.dialogEl.style.zIndex = '1';
    } else {
      this.dialogEl.removeAttribute('aria-hidden');
      this.dialogEl.style.pointerEvents = 'auto';
      this.dialogEl.style.zIndex = '';
    }
  };

  private readonly handleDetailBeforeOpen = () => {
    this.setDialogDisplayMode('modeless');
    this.setDialogDetailOverlayState(true);
  };

  private readonly handleDetailAfterClose = () => {
    this.setDialogDetailOverlayState(false);
    if (this.selectedCategory) {
      this.setDialogDisplayMode('modal');
    }
  };

  private setDialogDisplayMode(mode: 'modal' | 'modeless') {
    if (!this.selectedCategory) {
      return;
    }
    if (!this.dialogEl || !this.dialogEl.isConnected) {
      this.dialogEl = this.renderRoot.querySelector('#data-dialog') as
        | HTMLDialogElement
        | undefined;
    }
    const dialog = this.dialogEl;
    if (!dialog) {
      return;
    }

    const wantModal = mode === 'modal';

    if (!dialog.open) {
      if (wantModal) {
        dialog.showModal();
        this.dialogIsModal = true;
      } else {
        dialog.show();
        this.dialogIsModal = false;
      }
      return;
    }

    if (wantModal && !this.dialogIsModal) {
      this.suppressDialogCloseCleanup = true;
      dialog.close();
      dialog.showModal();
      this.dialogIsModal = true;
    } else if (!wantModal && this.dialogIsModal) {
      this.suppressDialogCloseCleanup = true;
      dialog.close();
      dialog.show();
      this.dialogIsModal = false;
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Let our logic know we're ready to receive updates
    this.logic.ui$.value = this;
  }

  override disconnectedCallback(): void {
    if (this.tooltipEl?.isConnected) {
      this.tooltipEl.remove();
    }
    this.tooltipEl = undefined;

    if (this.dialogEl) {
      this.dialogEl.removeEventListener('close', this.closeDataDialog);
      if (this.dialogEl.open) {
        this.dialogEl.close();
      }
    }
    this.dialogEl = undefined;
    this.dialogTable = undefined;
    this.dialogLogic = undefined;

    if (this.logic.chartInstance) {
      this.logic.chartInstance.destroy();
      this.logic.chartInstance = null;
    }
    this.canvasEl = undefined;
    this.logic.ui$.value = undefined;

    super.disconnectedCallback();
  }

  override render(): TemplateResult {
    // Get height setting for wrapper class
    const height = this.logic.view.data$.value?.height || 'Medium';
    const heightClass = height.toLowerCase();
    const showCaption = this.logic.view.data$.value?.showCaption === true;
    const captionText = this.logic.view.data$.value?.captionText ?? '';
    const chartType = this.logic.view.data$.value?.chartType ?? 'pie';
    const wrapperAlignmentClass =
      chartType === 'pie' ? 'align-center' : 'align-left';
    const containerStyleOverrides = styleMap(
      chartType === 'pie'
        ? {}
        : {
            alignItems: 'stretch',
            justifyContent: 'flex-start',
            maxWidth: '100%',
            margin: '0',
            paddingLeft: '0',
            paddingRight: '24px',
          }
    );

    // If the user provided a header widget, render it above the chart
    return html`
      ${this.logic.root.config.headerWidget
        ? renderUniLit(this.logic.root.config.headerWidget, {
            dataViewLogic: this.logic,
          })
        : ''}
      <div class="${chartContainerStyle}" style=${containerStyleOverrides}>
        <div class="chart-wrapper ${heightClass} ${wrapperAlignmentClass}">
          <canvas id="chart-canvas"></canvas>
          <dialog id="data-dialog">
            ${this.selectedCategory ? this.renderDataDialog() : ''}
          </dialog>
        </div>
        ${showCaption
          ? html`<div
              class="chart-caption"
              style="margin: 12px auto 0; text-align: center;"
            >
              ${captionText}
            </div>`
          : ''}
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
    const colorScheme = (this.logic.view.data$.value?.colorScheme ??
      'auto') as keyof typeof colorPalettes;
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
    const selectedPalette = (colorPalettes[colorScheme] ??
      colorPalettes.auto) as string[];
    const paletteColors = rawLabels.map((_, idx) => {
      return selectedPalette[idx % selectedPalette.length];
    });

    const toRGBA = (color: string, alpha: number) => {
      const match = color.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/
      );
      if (match) {
        const [, r, g, b] = match;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      return color;
    };

    // 5) Determine Chart.js "type" (we treat 'pie' as 'doughnut')
    const chartType = this.logic.view.data$.value?.chartType ?? 'pie';
    const isDoughnut = chartType === 'pie';
    const isLine = chartType === 'line';
    const type = isDoughnut
      ? 'doughnut'
      : chartType === 'bar' ||
          chartType === 'horizontal-bar' ||
          chartType === 'stacked-bar'
        ? 'bar'
        : isLine
          ? 'line'
          : 'bar';
    const isStacked = chartType === 'stacked-bar';
    const horizontal = chartType === 'horizontal-bar';
    const gridMode = (this.logic.view.data$.value?.gridLine ?? 'horizontal') as
      | 'horizontal'
      | 'vertical'
      | 'both'
      | 'none';
    const axisNameMode = (this.logic.view.data$.value?.axisNameMode ??
      'none') as 'none' | 'x' | 'y' | 'both';
    const smoothLine = this.logic.view.data$.value?.smoothLine !== false;
    const gradientArea = this.logic.view.data$.value?.gradientArea !== false;
    const showLineDataLabels =
      this.logic.view.data$.value?.showDataLabels !== false;
    const showVerticalGrid =
      isLine && (gridMode === 'vertical' || gridMode === 'both');
    const showHorizontalGrid =
      isLine && (gridMode === 'horizontal' || gridMode === 'both');
    const showXAxisTitle =
      isLine && (axisNameMode === 'x' || axisNameMode === 'both');
    const showYAxisTitle =
      isLine && (axisNameMode === 'y' || axisNameMode === 'both');

    const axisPropertyId =
      this.logic.view.data$.value?.xAxisPropertyId ??
      this.logic.view.data$.value?.categoryPropertyId;
    const axisProperty = this.logic.view.properties$.value.find(
      (prop: any) => prop.id === axisPropertyId
    );
    const xAxisTitle = axisProperty?.name$.value ?? 'Category';
    const yAxisTitle = 'Value';
    const legendLabel = axisProperty?.name$.value ?? 'Category';

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
          ctx.fillText(displayLabels[index] ?? '', ex + offsetX, ey + offsetY);
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
          backgroundColor: paletteColors[idx],
          borderWidth: 2,
        }))
      : [
          (() => {
            const dataset: any = {
              // Setting `label: ''` ensures Chart.js never auto-prepends "Status" anywhere
              label: '',
              data: dataValues,
              backgroundColor: paletteColors,
              borderWidth: isDoughnut ? 1 : 2,
            };
            if (isDoughnut) {
              dataset.hoverOffset = 4;
              dataset.cutout = '85%';
            }
            if (isLine) {
              const strokeColor = paletteColors[0] ?? 'rgb(75, 192, 192)';
              dataset.borderColor = strokeColor;
              dataset.pointBackgroundColor = paletteColors;
              dataset.pointBorderColor = '#ffffff';
              dataset.pointRadius = 4;
              dataset.pointHoverRadius = 6;
              dataset.pointHoverBorderWidth = 2;
              dataset.tension = smoothLine ? 0.35 : 0;
              dataset.fill = gradientArea ? 'start' : false;
              dataset.backgroundColor = gradientArea
                ? (context: any) => {
                    const { chart } = context;
                    const { ctx: chartCtx, chartArea } = chart;
                    if (!chartArea) {
                      return toRGBA(strokeColor, 0.3);
                    }
                    const gradient = chartCtx.createLinearGradient(
                      0,
                      chartArea.top,
                      0,
                      chartArea.bottom
                    );
                    gradient.addColorStop(0, toRGBA(strokeColor, 0.45));
                    gradient.addColorStop(1, toRGBA(strokeColor, 0));
                    return gradient;
                  }
                : toRGBA(strokeColor, 0.85);
              dataset.label = legendLabel;
            }
            return dataset;
          })(),
        ];

    if (!isDoughnut && !isStacked && datasets.length > 0) {
      (datasets[0] as { label?: string }).label = legendLabel;
    }

    const lineDataLabelPlugin = {
      id: 'line-data-labels',
      afterDatasetsDraw: (chart: Chart) => {
        if (!isLine || !showLineDataLabels) {
          return;
        }
        const meta = chart.getDatasetMeta(0);
        if (meta.type !== 'line') {
          return;
        }
        const dataset = chart.data.datasets[0];
        if (!dataset || !Array.isArray(dataset.data)) {
          return;
        }
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        meta.data.forEach((element: any, index: number) => {
          const raw = dataset.data[index] as unknown;
          let numericValue: number | undefined;
          if (typeof raw === 'number') {
            numericValue = raw;
          } else if (raw && typeof raw === 'object') {
            const candidate = raw as { x?: unknown; y?: unknown };
            numericValue =
              typeof candidate.y === 'number'
                ? candidate.y
                : typeof candidate.x === 'number'
                  ? candidate.x
                  : undefined;
          }
          if (!Number.isFinite(numericValue)) {
            return;
          }
          const position = element.tooltipPosition();
          ctx.fillText(String(numericValue), position.x, position.y - 6);
        });
        ctx.restore();
      },
    };

    const extraPlugins: any[] = [];
    if (isDoughnut) {
      extraPlugins.push(centerTextPlugin, outerLabelPlugin);
    }
    if (isLine && showLineDataLabels) {
      extraPlugins.push(lineDataLabelPlugin);
    }

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
                    display: type === 'line' ? showVerticalGrid : false,
                    color: 'rgba(255, 255, 255, 0.1)',
                  },
                  ticks: {
                    color: 'rgba(255, 255, 255, 0.46)',
                  },
                  title: {
                    display: showXAxisTitle,
                    text: xAxisTitle,
                    color: 'rgba(255, 255, 255, 0.46)',
                    font: {
                      size: 12,
                      weight: 400 as const,
                    },
                    padding: { top: 12 },
                  },
                },
                y: {
                  stacked: isStacked,
                  beginAtZero: true,
                  grid: {
                    display: type === 'line' ? showHorizontalGrid : true,
                    color: 'rgba(255, 255, 255, 0.1)',
                  },
                  ticks: {
                    color: 'rgba(255, 255, 255, 0.46)',
                  },
                  title: {
                    display: showYAxisTitle,
                    text: yAxisTitle,
                    color: 'rgba(255, 255, 255, 0.46)',
                    font: {
                      size: 12,
                      weight: 400 as const,
                    },
                    padding: { bottom: 8 },
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

          // ─── Disable ALL built-in "datalabels" (in case you had chartjs-plugin-datalabels) ───
          // This ensures no extra text (like "Status") is ever rendered automatically on each slice.
          // Only include if datalabels plugin is available
          ...((Chart.defaults.plugins as unknown as { datalabels?: unknown })
            ?.datalabels !== undefined && {
            datalabels: {
              display: false,
            },
          }),
        },
      },
      // Only include the plugins that are relevant for this chart type
      plugins: extraPlugins,
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
    const dataIndex =
      typeof dataPoint.dataIndex === 'number'
        ? dataPoint.dataIndex
        : typeof dataPoint.index === 'number'
          ? dataPoint.index
          : undefined;
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
        ? dataset.data[dataIndex ?? 0]
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
    const indexLabel = this.getLabelForIndex(dataIndex);
    const rawLabel = typeof dataPoint.label === 'string' ? dataPoint.label : '';
    const label =
      (rawLabel && rawLabel !== 'Total' ? rawLabel : undefined) ??
      datasetLabel ??
      indexLabel ??
      '';

    const datasetBg = dataPoint.dataset?.backgroundColor;
    let color: string | undefined;
    if (Array.isArray(datasetBg)) {
      const colorIndex =
        (typeof dataPoint.dataIndex === 'number'
          ? dataPoint.dataIndex
          : typeof dataPoint.index === 'number'
            ? dataPoint.index
            : undefined) ?? 0;
      color = datasetBg[colorIndex] as string | undefined;
    } else if (typeof datasetBg === 'string') {
      color = datasetBg;
    }
    if (
      !color &&
      typeof dataPoint.element?.options?.backgroundColor === 'string'
    ) {
      color = dataPoint.element?.options?.backgroundColor as string;
    }
    if (!color) {
      const borderColor = dataPoint.dataset?.borderColor;
      if (Array.isArray(borderColor)) {
        color = borderColor[dataPoint.dataIndex] as string | undefined;
      } else if (typeof borderColor === 'string') {
        color = borderColor;
      }
    }

    tooltipEl.replaceChildren();

    const titleDiv = document.createElement('div');
    titleDiv.className = 'title';

    const colorBox = document.createElement('span');
    colorBox.className = 'color-box';
    colorBox.style.background =
      typeof color === 'string' ? color : 'var(--affine-icon-secondary)';

    const titleLabel = label && label.length > 0 ? label : undefined;
    const titleParts = [titleLabel, String(countValue), `(${pct}%)`].filter(
      (part): part is string => part != null
    );
    const titleText = document.createTextNode(titleParts.join(' '));
    titleDiv.append(colorBox, titleText);

    const divider = document.createElement('div');
    divider.className = 'divider';

    const actionDiv = document.createElement('div');
    actionDiv.className = 'action';
    actionDiv.textContent = 'Click to view data';
    actionDiv.addEventListener('click', () => {
      const resolvedLabel = this.resolveCategoryLabelFromSource(
        dataPoint,
        label
      );
      if (resolvedLabel) {
        void this.openDataDialog(resolvedLabel).catch(console.error);
      }
    });

    tooltipEl.append(titleDiv, divider, actionDiv);

    const { offsetLeft: left, offsetTop: top } = chart.canvas;
    tooltipEl.style.opacity = '1';
    tooltipEl.style.left = left + tooltip.caretX + 'px';
    tooltipEl.style.top = top + tooltip.caretY + 'px';
  };

  private async openDataDialog(category: string) {
    this.selectedCategory = category;
    const categoryId = this.logic.view.data$.value?.categoryPropertyId;
    if (!categoryId) return;

    if (!this.dialogTable) {
      const data = tableViewModel.model.defaultData(this.logic.view.manager);
      const props = this.logic.view.manager.dataSource.properties$.value;
      const tableData: TableViewData = {
        id: 'dialog-table',
        name: 'Dialog Table',
        mode: 'table',
        ...data,
        columns: props.map(id => ({ id, width: DEFAULT_COLUMN_WIDTH })),
      };
      this.dialogTable = new DialogTableView(
        this.logic.view.manager,
        tableData
      );
      this.dialogLogic = new DialogTableViewUILogic(
        this.logic.root,
        this.dialogTable,
        {
          beforeOpen: this.handleDetailBeforeOpen,
          afterClose: this.handleDetailAfterClose,
        }
      );
    }

    const prop = this.logic.view.propertyGetOrCreate(categoryId);
    const categoryRowIds =
      this.logic.view.categoryRowIds$.value?.[category] ?? undefined;
    this.dialogTable.setVisibleRowIds(categoryRowIds);

    const filterConfig = this.buildCategoryFilter(prop, category);

    const filter: FilterGroup = {
      type: 'group',
      op: 'and',
      conditions: filterConfig
        ? [
            {
              type: 'filter',
              left: { type: 'ref', name: categoryId },
              function: filterConfig.functionName,
              args: [{ type: 'literal', value: filterConfig.value }],
            },
          ]
        : [],
    };
    this.dialogTable.dataUpdate(() => ({ filter }));

    await this.updateComplete;
    if (!this.dialogEl) {
      this.dialogEl = this.renderRoot.querySelector('#data-dialog') as
        | HTMLDialogElement
        | undefined;
      this.dialogEl?.addEventListener('close', this.closeDataDialog);
    }
    if (!this.dialogEl) {
      this.dialogEl = this.renderRoot.querySelector('#data-dialog') as
        | HTMLDialogElement
        | undefined;
    }
    if (!this.dialogEl) {
      return;
    }
    if (!this.dialogEl.open) {
      this.dialogEl.showModal();
      this.dialogIsModal = true;
    } else if (!this.dialogIsModal) {
      this.setDialogDisplayMode('modal');
    }
  }

  private readonly closeDataDialog = () => {
    this.dialogEl = this.renderRoot.querySelector('#data-dialog') as
      | HTMLDialogElement
      | undefined;
    if (this.suppressDialogCloseCleanup) {
      this.suppressDialogCloseCleanup = false;
      return;
    }
    if (this.dialogEl?.open) {
      this.dialogEl.close();
    }
    this.setDialogDetailOverlayState(false);
    this.selectedCategory = null;
    this.dialogTable?.setVisibleRowIds(undefined);
    this.dialogTable = undefined;
    this.dialogLogic = undefined;
    this.dialogIsModal = false;
    this.suppressDialogCloseCleanup = false;
  };

  private renderDataDialog() {
    const categoryId = this.logic.view.data$.value?.categoryPropertyId;
    if (!categoryId || !this.selectedCategory) return html``;

    // Ensure the property exists
    this.logic.view.propertyGetOrCreate(categoryId);
    if (!this.dialogLogic) return html``;

    return html`
      <div
        class="dialog-content affine-database-table ${tableViewStyle} data-view-popup-container"
      >
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

  private buildCategoryFilter(
    property: ChartProperty,
    categoryLabel: string
  ): {
    functionName: string;
    value: unknown;
  } | null {
    const rawValue = this.logic.view.categoryRawValues$.value?.[categoryLabel];
    const type = property.type$.value;

    if (type === 'select') {
      const ids = this.ensureStringArray(rawValue);
      const resolved = ids.length
        ? ids
        : this.resolveSelectOptionIds(property, [categoryLabel]);
      if (!resolved.length) {
        return null;
      }
      return {
        functionName: 'isOneOf',
        value: resolved,
      };
    }

    if (type === 'multi-select') {
      const ids = this.ensureStringArray(rawValue);
      if (!ids.length) {
        const labels = categoryLabel
          .split(',')
          .map(v => v.trim())
          .filter(Boolean);
        const resolved = this.resolveSelectOptionIds(property, labels);
        if (!resolved.length) {
          return null;
        }
        return {
          functionName: 'containsOneOf',
          value: resolved,
        };
      }
      return {
        functionName: 'containsOneOf',
        value: ids,
      };
    }

    if (type === 'checkbox') {
      const boolValue =
        typeof rawValue === 'boolean'
          ? rawValue
          : typeof categoryLabel === 'string'
            ? categoryLabel.trim().toLowerCase() === 'true'
            : undefined;
      if (boolValue == null) {
        return null;
      }
      return {
        functionName: 'is',
        value: boolValue,
      };
    }

    if (type === 'number') {
      const numeric =
        typeof rawValue === 'number'
          ? rawValue
          : typeof categoryLabel === 'string'
            ? Number(categoryLabel)
            : NaN;
      if (Number.isNaN(numeric)) {
        return null;
      }
      return {
        functionName: 'is',
        value: numeric,
      };
    }

    if (rawValue != null) {
      return {
        functionName: 'is',
        value: rawValue,
      };
    }

    if (categoryLabel) {
      return {
        functionName: 'is',
        value: categoryLabel,
      };
    }

    return null;
  }

  private ensureStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    return typeof value === 'string' ? [value] : [];
  }

  private resolveSelectOptionIds(
    property: ChartProperty,
    labels: string[]
  ): string[] {
    if (!labels.length) {
      return [];
    }
    const data = property.data$.value as
      | { options?: { id: string; value: string }[] }
      | undefined;
    const options = data?.options ?? [];
    if (!options.length) {
      return [];
    }
    const labelSet = new Set(labels.map(label => label.trim()).filter(Boolean));
    return options
      .filter(option => labelSet.has(option.value))
      .map(option => option.id);
  }

  private getLabelForIndex(index: unknown): string | undefined {
    if (typeof index !== 'number') {
      return undefined;
    }
    const label = this.chartLabels[index];
    return typeof label === 'string' && label.length > 0 ? label : undefined;
  }

  private resolveCategoryLabelFromSource(
    source: { label?: unknown; dataIndex?: unknown; index?: unknown },
    fallback?: string
  ): string | undefined {
    const directLabel =
      typeof source.label === 'string' && source.label.trim().length > 0
        ? source.label.trim()
        : undefined;
    if (directLabel && directLabel !== 'Total') {
      return directLabel;
    }
    const index =
      typeof source.dataIndex === 'number'
        ? source.dataIndex
        : typeof source.index === 'number'
          ? source.index
          : undefined;
    const indexed = this.getLabelForIndex(index);
    if (indexed) {
      return indexed;
    }
    if (fallback && fallback.trim().length > 0) {
      return fallback.trim();
    }
    return undefined;
  }

  private readonly handleChartClick = (_event: unknown, elements: any[]) => {
    if (!elements || elements.length === 0) return;
    const el = elements[0];
    const resolvedLabel = this.resolveCategoryLabelFromSource(el);
    if (resolvedLabel) {
      void this.openDataDialog(resolvedLabel).catch(console.error);
    }
  };

  override updated(changedProps: Map<string, unknown>) {
    super.updated(changedProps);
    // Skip chart recreation when only selectedCategory changes (dialog open/close)
    // This prevents the chart from re-animating when closing the row data dialog
    if (changedProps.has('selectedCategory') && changedProps.size === 1) {
      return;
    }
    this.createOrUpdateChart();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dv-chart-view-ui': ChartViewUI;
  }
}
