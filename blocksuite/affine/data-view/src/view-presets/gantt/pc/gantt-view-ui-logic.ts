import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { css } from '@emotion/css';
import { computed, signal } from '@preact/signals-core';
import { type TemplateResult } from 'lit';
import { ref } from 'lit/directives/ref.js';
import { html } from 'lit/static-html.js';

import { getColorByColor } from '../../../core/component/tags/colors.js';
import {
  createUniComponentFromWebComponent,
  renderUniLit,
} from '../../../core/index.js';
import type { SelectTag } from '../../../core/logical/type-presets.js';
import {
  DataViewUIBase,
  DataViewUILogicBase,
} from '../../../core/view/data-view-base.js';
import type { GanttTimeScale } from '../define.js';
import type { GanttSingleView } from '../gantt-view-manager.js';
import type { GanttViewSelectionWithType } from '../selection.js';
import {
  GanttDragController,
  type GanttDragMode,
} from './gantt-drag-controller.js';
import type { GanttRowData } from './row-list.js';
import { ROW_HEIGHT } from './row-list.js';
import { calendarDaysBetween } from './utils.js';

export const DAY_WIDTH_BY_SCALE = {
  day: 40,
  week: 16,
  month: 6,
} as const;

export const SCALE_ORDER: GanttTimeScale[] = ['month', 'week', 'day'];

/**
 * Pick the scale whose chart width is closest to the viewport width.
 * This fills the viewport without excessive empty space or excessive scrolling.
 */
export function pickFitScale(
  totalDays: number,
  viewportWidth: number
): GanttTimeScale {
  let bestScale: GanttTimeScale = 'month';
  let bestDiff = Infinity;
  for (const scale of SCALE_ORDER) {
    const totalWidth = totalDays * DAY_WIDTH_BY_SCALE[scale];
    const diff = Math.abs(totalWidth - viewportWidth);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestScale = scale;
    }
  }
  return bestScale;
}

/**
 * Compute the next scale index for zoom in/out.
 * Returns null if already at the boundary.
 */
export function nextZoomScale(
  current: GanttTimeScale,
  direction: 'in' | 'out'
): GanttTimeScale | null {
  const idx = SCALE_ORDER.indexOf(current);
  if (direction === 'in') {
    return idx < SCALE_ORDER.length - 1 ? SCALE_ORDER[idx + 1]! : null;
  }
  return idx > 0 ? SCALE_ORDER[idx - 1]! : null;
}

export class GanttViewUILogic extends DataViewUILogicBase<
  GanttSingleView,
  GanttViewSelectionWithType
> {
  ui$ = signal<GanttViewUI | undefined>();
  dragController = new GanttDragController(this);

  timeScale$ = computed(() => {
    return this.view.timeScale$.value;
  });

  dayWidth$ = computed(() => {
    return DAY_WIDTH_BY_SCALE[this.timeScale$.value];
  });

  private get readonly() {
    return this.view.readonly$.value;
  }

  clearSelection = () => {
    this.setSelection(undefined);
  };

  addRow = (position: InsertToPosition) => {
    if (this.readonly) return;
    const rowId = this.view.rowAdd(position);
    if (rowId) {
      this.root.openDetailPanel({
        view: this.view,
        rowId,
      });
    }
    this.ui$.value?.requestUpdate();
    return rowId;
  };

  focusFirstCell = () => {
    // No cell focus in Gantt view for now
  };

  showIndicator = (_evt: MouseEvent) => {
    return false;
  };

  hideIndicator = () => {
    // No indicator in Gantt view for now
  };

  moveTo = (_id: string, _evt: MouseEvent) => {
    // No drag-move in Gantt view for now
  };

  onRowClick = (rowId: string) => {
    this.root.openDetailPanel({
      view: this.view,
      rowId,
    });
  };

  onBarClick = (rowId: string) => {
    this.root.openDetailPanel({
      view: this.view,
      rowId,
    });
  };

  onBarDragStart = (
    rowId: string,
    mode: GanttDragMode,
    clientX: number,
    startDate: number,
    endDate: number
  ) => {
    if (this.readonly) return;
    this.dragController.startDrag(rowId, mode, clientX, startDate, endDate);
  };

  renderer = createUniComponentFromWebComponent(GanttViewUI);
}

export class GanttViewUI extends DataViewUIBase<GanttViewUILogic> {
  private readonly chartBodyRef = signal<HTMLElement | undefined>(undefined);
  private readonly rowListBodyRef = signal<HTMLElement | undefined>(undefined);
  private readonly timelineHeaderRef = signal<HTMLElement | undefined>(
    undefined
  );

  private hasInitialized = false;
  private wheelHandler: ((e: WheelEvent) => void) | null = null;
  private zoomDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Drag-to-scroll state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartScrollLeft = 0;

  private readonly syncScrollFromChart = (e: Event) => {
    const target = e.target as HTMLElement;
    const rowListBody = this.rowListBodyRef.value;
    if (rowListBody) {
      rowListBody.scrollTop = target.scrollTop;
    }
    const header = this.timelineHeaderRef.value;
    if (header) {
      header.scrollLeft = target.scrollLeft;
    }
  };

  private readonly syncScrollFromRowList = (scrollTop: number) => {
    const chartBody = this.chartBodyRef.value;
    if (chartBody) {
      chartBody.scrollTop = scrollTop;
    }
  };

  override connectedCallback(): void {
    super.connectedCallback();
    this.logic.ui$.value = this;
    this.classList.add('gantt-view', ganttViewStyle);

    // Listen for fit-to-view events from the toolbar zoom widget
    this.addEventListener('gantt-fit-to-view', this.handleFitToView);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeWheelListener();
    this.removeEventListener('gantt-fit-to-view', this.handleFitToView);
    if (this.zoomDebounceTimer != null) {
      clearTimeout(this.zoomDebounceTimer);
      this.zoomDebounceTimer = null;
    }
  }

  override updated(): void {
    const chartBody = this.chartBodyRef.value;
    if (!chartBody) return;

    // Attach wheel listener if not yet done
    if (!this.wheelHandler) {
      this.attachWheelListener(chartBody);
    }

    // Auto-fit or scroll-to-today on first render
    if (!this.hasInitialized) {
      this.hasInitialized = true;
      const currentScale = this.logic.view.timeScale$.value;
      if (currentScale === 'day') {
        this.fitToView();
      } else {
        this.scrollToToday();
      }
    }
  }

  // --- Fit to view (called from toolbar widget via custom event) ---

  private readonly handleFitToView = () => {
    this.fitToView();
  };

  private fitToView(): void {
    const chartBody = this.chartBodyRef.value;
    const viewportWidth = chartBody?.clientWidth ?? 800;
    const range = this.getTimelineRange();
    const bestScale = pickFitScale(range.totalDays, viewportWidth);

    this.logic.view.setTimeScale(bestScale);
    requestAnimationFrame(() => {
      if (chartBody) {
        chartBody.scrollLeft = 0;
      }
    });
  }

  private scrollToToday(): void {
    const chartBody = this.chartBodyRef.value;
    if (!chartBody) return;
    const range = this.getTimelineRange();
    const dayWidth = this.logic.dayWidth$.value;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dayIndex = calendarDaysBetween(range.startDate, now);
    if (dayIndex < 0 || dayIndex >= range.totalDays) {
      chartBody.scrollLeft = 0;
      return;
    }
    const targetX = dayIndex * dayWidth - chartBody.clientWidth / 3;
    chartBody.scrollLeft = Math.max(0, targetX);
  }

  // --- Ctrl+scroll wheel zoom ---

  private changeScale(
    newScale: GanttTimeScale,
    anchorDayIndex: number,
    anchorViewportX: number
  ): void {
    const currentScale = this.logic.timeScale$.value;
    if (newScale === currentScale) return;

    this.logic.view.setTimeScale(newScale);

    const newDayWidth = DAY_WIDTH_BY_SCALE[newScale];
    requestAnimationFrame(() => {
      const chartBody = this.chartBodyRef.value;
      if (chartBody) {
        chartBody.scrollLeft = anchorDayIndex * newDayWidth - anchorViewportX;
      }
    });
  }

  private attachWheelListener(chartBody: HTMLElement): void {
    this.wheelHandler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      if (this.zoomDebounceTimer != null) return;
      this.zoomDebounceTimer = setTimeout(() => {
        this.zoomDebounceTimer = null;
      }, 150);

      const rect = chartBody.getBoundingClientRect();
      const cursorViewportX = e.clientX - rect.left;
      const cursorDayIndex =
        (chartBody.scrollLeft + cursorViewportX) / this.logic.dayWidth$.value;

      const direction = e.deltaY < 0 ? 'in' : 'out';
      const newScale = nextZoomScale(this.logic.timeScale$.value, direction);
      if (!newScale) return;

      this.changeScale(newScale, cursorDayIndex, cursorViewportX);
    };
    chartBody.addEventListener('wheel', this.wheelHandler, { passive: false });
  }

  private removeWheelListener(): void {
    const chartBody = this.chartBodyRef.value;
    if (chartBody && this.wheelHandler) {
      chartBody.removeEventListener('wheel', this.wheelHandler);
    }
    this.wheelHandler = null;
  }

  // --- Click-and-drag to scroll ---

  private readonly onChartPointerDown = (e: PointerEvent) => {
    // Only drag on background, not on task bars or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('affine-data-view-gantt-task-bar')) return;

    const chartBody = this.chartBodyRef.value;
    if (!chartBody) return;

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartScrollLeft = chartBody.scrollLeft;
    chartBody.style.cursor = 'grabbing';
    chartBody.setPointerCapture(e.pointerId);
  };

  private readonly onChartPointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;
    const chartBody = this.chartBodyRef.value;
    if (!chartBody) return;

    const dx = e.clientX - this.dragStartX;
    chartBody.scrollLeft = this.dragStartScrollLeft - dx;
  };

  private readonly onChartPointerUp = (e: PointerEvent) => {
    if (!this.isDragging) return;
    this.isDragging = false;
    const chartBody = this.chartBodyRef.value;
    if (chartBody) {
      chartBody.style.cursor = '';
      chartBody.releasePointerCapture(e.pointerId);
    }
  };

  // --- Data helpers ---

  private findSelectProperty(): {
    propertyId: string;
    options: SelectTag[];
  } | null {
    const properties = this.logic.view.propertiesRaw$.value;
    for (const prop of properties) {
      const type = prop.type$.value;
      if (type === 'select' || type === 'multi-select') {
        const data = prop.data$.value as { options?: SelectTag[] } | undefined;
        if (data?.options) {
          return { propertyId: prop.id, options: data.options };
        }
      }
    }
    return null;
  }

  private getRowsData(): GanttRowData[] {
    const rows = this.logic.view.rows$.value;
    const titleColumnId = this.logic.view.mainProperties$.value.titleColumn;
    const selectProp = this.findSelectProperty();

    return rows.map(row => {
      let title = '';
      if (titleColumnId) {
        title =
          this.logic.view.cellGetOrCreate(row.rowId, titleColumnId).stringValue$
            .value ?? '';
      }

      let color: string | null = null;
      if (selectProp) {
        const cellValue = this.logic.view.cellGetOrCreate(
          row.rowId,
          selectProp.propertyId
        ).value$.value as string | string[] | null;
        const optionId = Array.isArray(cellValue) ? cellValue[0] : cellValue;
        if (optionId) {
          const option = selectProp.options.find(o => o.id === optionId);
          if (option) {
            color = getColorByColor(option.color);
          }
        }
      }

      return { rowId: row.rowId, title, color };
    });
  }

  private getTimelineRange(): { startDate: Date; totalDays: number } {
    const rows = this.logic.view.rows$.value;
    const startColId = this.logic.view.startDateColumnId$.value;
    const endColId = this.logic.view.endDateColumnId$.value;

    if (!startColId || !endColId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { startDate: today, totalDays: 30 };
    }

    let minDate: number | null = null;
    let maxDate: number | null = null;

    for (const row of rows) {
      const startVal = this.logic.view.cellGetOrCreate(row.rowId, startColId)
        .value$.value as number | null;
      const endVal = this.logic.view.cellGetOrCreate(row.rowId, endColId).value$
        .value as number | null;

      if (startVal != null && (minDate == null || startVal < minDate)) {
        minDate = startVal;
      }
      if (endVal != null && (maxDate == null || endVal > maxDate)) {
        maxDate = endVal;
      }
    }

    if (minDate == null || maxDate == null) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { startDate: today, totalDays: 30 };
    }

    const startDate = new Date(minDate);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(maxDate);
    endDate.setHours(0, 0, 0, 0);
    endDate.setDate(endDate.getDate() + 7);

    // Cap at ~3 years to prevent browser freeze from typo dates (e.g. year 2924)
    const MAX_TOTAL_DAYS = 1095;
    const totalDays = Math.min(
      MAX_TOTAL_DAYS,
      Math.max(30, calendarDaysBetween(startDate, endDate))
    );

    return { startDate, totalDays };
  }

  private getTodayOffset(
    startDate: Date,
    totalDays: number,
    dayWidth: number
  ): number | null {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dayIndex = calendarDaysBetween(startDate, now);
    if (dayIndex < 0 || dayIndex >= totalDays) return null;
    return dayIndex * dayWidth;
  }

  // --- Render ---

  override render(): TemplateResult {
    const logic = this.logic;
    const rowsData = this.getRowsData();
    const range = this.getTimelineRange();
    const dayWidth = logic.dayWidth$.value;
    const timeScale = logic.timeScale$.value;
    const startColId = logic.view.startDateColumnId$.value;
    const endColId = logic.view.endDateColumnId$.value;
    const chartWidth = range.totalDays * dayWidth;
    const todayOffset = this.getTodayOffset(
      range.startDate,
      range.totalDays,
      dayWidth
    );

    return html`
      ${renderUniLit(logic.root.config.headerWidget, {
        dataViewLogic: logic,
      })}
      <div class="${ganttContainerStyle}">
        <affine-data-view-gantt-row-list
          .rows="${rowsData}"
          .onRowClick="${logic.onRowClick}"
          .onScroll="${this.syncScrollFromRowList}"
          ${ref((el?: Element) => {
            if (el) {
              const body = el.querySelector('.gantt-row-list-body');
              if (body instanceof HTMLElement) {
                this.rowListBodyRef.value = body;
              }
            }
          })}
        ></affine-data-view-gantt-row-list>
        <div class="${ganttChartAreaStyle}">
          <div
            class="${ganttTimelineScrollStyle}"
            ${ref(this.timelineHeaderRef)}
          >
            <affine-data-view-gantt-timeline-header
              .startDate="${range.startDate}"
              .totalDays="${range.totalDays}"
              .dayWidth="${dayWidth}"
              .timeScale="${timeScale}"
              style="width: ${chartWidth}px; min-width: ${chartWidth}px;"
            ></affine-data-view-gantt-timeline-header>
          </div>
          <div
            class="${ganttChartBodyStyle}"
            @scroll="${this.syncScrollFromChart}"
            @pointerdown="${this.onChartPointerDown}"
            @pointermove="${this.onChartPointerMove}"
            @pointerup="${this.onChartPointerUp}"
            @pointercancel="${this.onChartPointerUp}"
            ${ref(this.chartBodyRef)}
          >
            <div
              class="${ganttChartInnerStyle}"
              style="width: ${chartWidth}px;"
            >
              ${this.renderGridLines(
                range.startDate,
                range.totalDays,
                dayWidth
              )}
              ${rowsData.map(row => {
                const startVal = startColId
                  ? (logic.view.cellGetOrCreate(row.rowId, startColId).value$
                      .value as number | null)
                  : null;
                const endVal = endColId
                  ? (logic.view.cellGetOrCreate(row.rowId, endColId).value$
                      .value as number | null)
                  : null;

                return html`
                  <div class="${ganttChartRowStyle}">
                    <affine-data-view-gantt-task-bar
                      .rowId="${row.rowId}"
                      .title="${row.title}"
                      .startDate="${startVal}"
                      .endDate="${endVal}"
                      .timelineStart="${range.startDate}"
                      .dayWidth="${dayWidth}"
                      .barColor="${row.color}"
                      .onClick="${logic.onBarClick}"
                      .onDragStart="${logic.onBarDragStart}"
                    ></affine-data-view-gantt-task-bar>
                  </div>
                `;
              })}
              ${todayOffset != null
                ? html`<div
                    class="${ganttTodayLineStyle}"
                    style="left: ${todayOffset}px;"
                  ></div>`
                : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderGridLines(
    startDate: Date,
    totalDays: number,
    dayWidth: number
  ): TemplateResult {
    const lines: TemplateResult[] = [];
    const date = new Date(startDate);
    for (let i = 0; i < totalDays; i++) {
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      lines.push(
        html`<div
          class="${isWeekend ? ganttGridLineWeekendStyle : ganttGridLineStyle}"
          style="left: ${i * dayWidth}px; width: ${dayWidth}px; height: 100%;"
        ></div>`
      );
      date.setDate(date.getDate() + 1);
    }
    return html`${lines}`;
  }
}

// --- Styles ---

const ganttViewStyle = css({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  overflow: 'hidden',
});

const ganttContainerStyle = css({
  display: 'flex',
  width: '100%',
  overflow: 'hidden',
  border: '1px solid var(--affine-border-color)',
  borderRadius: '4px',
});

const ganttChartAreaStyle = css({
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  // Prevent flex child from growing beyond allocated space
  flex: '1 1 0',
  minWidth: 0,
  width: 0,
});

const ganttTimelineScrollStyle = css({
  overflow: 'hidden',
  flexShrink: 0,
});

const ganttChartBodyStyle = css({
  overflowX: 'scroll',
  overflowY: 'auto',
  cursor: 'grab',

  '&::-webkit-scrollbar': {
    WebkitAppearance: 'none',
    display: 'block',
  },

  '&::-webkit-scrollbar:horizontal': {
    height: '4px',
  },

  '&::-webkit-scrollbar:vertical': {
    width: 0,
    display: 'none',
  },

  '&::-webkit-scrollbar-thumb': {
    borderRadius: '2px',
    backgroundColor: 'transparent',
  },

  '&:hover::-webkit-scrollbar:horizontal': {
    height: '8px',
  },

  '&:hover::-webkit-scrollbar-thumb': {
    borderRadius: '16px',
    backgroundColor: 'var(--affine-black-30)',
  },

  '&:hover::-webkit-scrollbar-track': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});

const ganttChartInnerStyle = css({
  position: 'relative',
});

const ganttChartRowStyle = css({
  position: 'relative',
  height: `${ROW_HEIGHT}px`,
  borderBottom: '1px solid var(--affine-border-color)',
  display: 'flex',
  alignItems: 'stretch',
});

const ganttGridLineStyle = css({
  position: 'absolute',
  top: 0,
  bottom: 0,
  borderRight:
    '1px solid color-mix(in srgb, var(--affine-border-color) 50%, transparent)',
  boxSizing: 'border-box',
  pointerEvents: 'none',
});

const ganttGridLineWeekendStyle = css({
  position: 'absolute',
  top: 0,
  bottom: 0,
  borderRight:
    '1px solid color-mix(in srgb, var(--affine-border-color) 50%, transparent)',
  boxSizing: 'border-box',
  pointerEvents: 'none',
  background: 'color-mix(in srgb, var(--affine-hover-color) 50%, transparent)',
});

const ganttTodayLineStyle = css({
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: '2px',
  background: 'var(--affine-error-color, #eb4335)',
  zIndex: 3,
  pointerEvents: 'none',
  opacity: 0.6,
});

declare global {
  interface HTMLElementTagNameMap {
    'dv-gantt-view-ui': GanttViewUI;
  }
}
