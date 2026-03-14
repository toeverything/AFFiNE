import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { html } from 'lit/static-html.js';

import type { GanttTimeScale } from '../define.js';

const styles = css`
  affine-data-view-gantt-timeline-header {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--affine-border-color);
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--affine-background-primary-color);
  }

  .gantt-timeline-row {
    display: flex;
    height: 24px;
  }

  .gantt-timeline-row:first-child {
    height: 22px;
    border-bottom: 1px solid var(--affine-border-color);
  }

  .gantt-timeline-cell {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    color: var(--affine-text-secondary-color);
    border-right: 1px solid
      color-mix(in srgb, var(--affine-border-color) 60%, transparent);
    box-sizing: border-box;
    letter-spacing: 0.02em;
  }

  .gantt-timeline-cell.month-cell {
    font-weight: 600;
    color: var(--affine-text-primary-color);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-right: 1px solid var(--affine-border-color);
  }

  .gantt-timeline-cell.is-today {
    color: var(--affine-primary-color);
    font-weight: 600;
  }

  .gantt-timeline-cell.is-weekend {
    color: var(--affine-text-disable-color);
  }
`;

export class GanttTimelineHeader extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  @property({ attribute: false })
  accessor startDate!: Date;

  @property({ attribute: false })
  accessor totalDays!: number;

  @property({ attribute: false })
  accessor dayWidth!: number;

  @property({ attribute: false })
  accessor timeScale!: GanttTimeScale;

  private isToday(date: Date): boolean {
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  private renderDayScale(): TemplateResult {
    const cells: TemplateResult[] = [];
    const monthCells: TemplateResult[] = [];
    const date = new Date(this.startDate);

    let currentMonth = -1;
    let currentMonthYear = -1;
    let monthDayCount = 0;

    for (let i = 0; i < this.totalDays; i++) {
      const month = date.getMonth();
      const year = date.getFullYear();

      if (month !== currentMonth) {
        if (currentMonth !== -1) {
          monthCells.push(
            html`<div
              class="gantt-timeline-cell month-cell"
              style="width: ${monthDayCount * this.dayWidth}px"
            >
              ${this.getMonthName(currentMonth)}
              ${currentMonth === 0 ? currentMonthYear : ''}
            </div>`
          );
        }
        currentMonth = month;
        currentMonthYear = year;
        monthDayCount = 0;
      }
      monthDayCount++;

      const today = this.isToday(date);
      const weekend = this.isWeekend(date);
      const classes = [
        'gantt-timeline-cell',
        today ? 'is-today' : '',
        weekend ? 'is-weekend' : '',
      ]
        .filter(Boolean)
        .join(' ');

      cells.push(
        html`<div class="${classes}" style="width: ${this.dayWidth}px">
          ${date.getDate()}
        </div>`
      );

      date.setDate(date.getDate() + 1);
    }

    // Push last month
    if (monthDayCount > 0) {
      monthCells.push(
        html`<div
          class="gantt-timeline-cell month-cell"
          style="width: ${monthDayCount * this.dayWidth}px"
        >
          ${this.getMonthName(currentMonth)}
          ${currentMonth === 0 ? currentMonthYear : ''}
        </div>`
      );
    }

    return html`
      <div class="gantt-timeline-row">${monthCells}</div>
      <div class="gantt-timeline-row">${cells}</div>
    `;
  }

  private renderWeekScale(): TemplateResult {
    const cells: TemplateResult[] = [];
    const monthCells: TemplateResult[] = [];
    const date = new Date(this.startDate);

    let currentMonth = -1;
    let currentMonthYear = -1;
    let monthWidth = 0;

    const weekWidth = this.dayWidth * 7;

    for (let i = 0; i < this.totalDays; i += 7) {
      const month = date.getMonth();
      const year = date.getFullYear();

      if (month !== currentMonth) {
        if (currentMonth !== -1) {
          monthCells.push(
            html`<div
              class="gantt-timeline-cell month-cell"
              style="width: ${monthWidth}px"
            >
              ${this.getMonthName(currentMonth)}
              ${currentMonth === 0 ? currentMonthYear : ''}
            </div>`
          );
        }
        currentMonth = month;
        currentMonthYear = year;
        monthWidth = 0;
      }
      const actualWidth = Math.min(
        weekWidth,
        (this.totalDays - i) * this.dayWidth
      );
      monthWidth += actualWidth;

      const weekEnd = new Date(date);
      weekEnd.setDate(weekEnd.getDate() + 6);

      cells.push(
        html`<div class="gantt-timeline-cell" style="width: ${actualWidth}px">
          ${date.getDate()}-${weekEnd.getDate()}
        </div>`
      );

      date.setDate(date.getDate() + 7);
    }

    if (monthWidth > 0) {
      monthCells.push(
        html`<div
          class="gantt-timeline-cell month-cell"
          style="width: ${monthWidth}px"
        >
          ${this.getMonthName(currentMonth)}
          ${currentMonth === 0 ? currentMonthYear : ''}
        </div>`
      );
    }

    return html`
      <div class="gantt-timeline-row">${monthCells}</div>
      <div class="gantt-timeline-row">${cells}</div>
    `;
  }

  private renderMonthScale(): TemplateResult {
    const cells: TemplateResult[] = [];
    const yearCells: TemplateResult[] = [];
    const date = new Date(this.startDate);

    let currentYear = -1;
    let yearWidth = 0;

    let remaining = this.totalDays;
    while (remaining > 0) {
      const year = date.getFullYear();
      const month = date.getMonth();

      if (year !== currentYear) {
        if (currentYear !== -1) {
          yearCells.push(
            html`<div
              class="gantt-timeline-cell month-cell"
              style="width: ${yearWidth}px"
            >
              ${currentYear}
            </div>`
          );
        }
        currentYear = year;
        yearWidth = 0;
      }

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const startDay = date.getDate();
      const daysRemaining = daysInMonth - startDay + 1;
      const daysToRender = Math.min(daysRemaining, remaining);
      const width = daysToRender * this.dayWidth;
      yearWidth += width;

      cells.push(
        html`<div class="gantt-timeline-cell" style="width: ${width}px">
          ${this.getMonthName(month)}
        </div>`
      );

      remaining -= daysToRender;
      date.setMonth(month + 1, 1);
    }

    if (yearWidth > 0) {
      yearCells.push(
        html`<div
          class="gantt-timeline-cell month-cell"
          style="width: ${yearWidth}px"
        >
          ${currentYear}
        </div>`
      );
    }

    return html`
      <div class="gantt-timeline-row">${yearCells}</div>
      <div class="gantt-timeline-row">${cells}</div>
    `;
  }

  private getMonthName(month: number): string {
    const names = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return names[month] ?? '';
  }

  override render(): TemplateResult {
    switch (this.timeScale) {
      case 'week':
        return this.renderWeekScale();
      case 'month':
        return this.renderMonthScale();
      case 'day':
      default:
        return this.renderDayScale();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-gantt-timeline-header': GanttTimelineHeader;
  }
}
