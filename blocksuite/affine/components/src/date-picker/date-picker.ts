// blocksuite/affine/components/src/date-picker/date-picker.ts
import { clamp } from '@blocksuite/global/gfx';
import { WithDisposable } from '@blocksuite/global/lit';
import { isSameDay, isSameMonth, isToday } from 'date-fns';
import {
  html,
  LitElement,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import { arrowLeftIcon } from './icons.js';
import { datePickerStyle } from './style.js';
import { getMonthMatrix, toDate } from './utils.js';

const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface DateCell {
  rangeEnd: boolean;
  rangeStart: boolean;
  inRange: boolean;
  date: Date;
  label: string;
  isToday: boolean;
  notCurrentMonth: boolean;
  selected?: boolean;
  tabIndex?: number;
}

type NavActionArg = {
  action: () => void;
  disable?: boolean;
};

/**
 * Date picker component
 */
export class DatePicker extends WithDisposable(LitElement) {
  static override styles = datePickerStyle;

  /** internal cursor */
  private _cursor = new Date();
  private readonly _maxYear = 2099;
  private readonly _minYear = 1970;

  /** CSS vars for the outer card */
  get _cardStyle() {
    return {
      '--cell-size': `${this.size}px`,
      '--gap-h': `${this.gapH}px`,
      '--gap-v': `${this.gapV}px`,
      'min-width': `${this.cardWidth}px`,
      'min-height': `${this.cardHeight}px`,
      padding: `${this.padding}px`,
    };
  }

  get cardHeight() {
    const rows = 7;
    return this.size * rows + this.padding * 2 + this.gapV * (rows - 1) - 2;
  }

  get cardWidth() {
    const cols = 7;
    return this.size * cols + this.padding * 2 + this.gapH * (cols - 1);
  }

  get date() {
    return this._cursor.getDate();
  }
  get day() {
    return this._cursor.getDay();
  }
  get dayLabel() {
    return days[this.day];
  }
  get minHeight() {
    const rows = this._matrix.length;
    return this.size * rows + this.padding * 2 + this.gapV * (rows - 1) - 2;
  }
  get month() {
    return this._cursor.getMonth();
  }
  get monthLabel() {
    return months[this.month];
  }
  get year() {
    return this._cursor.getFullYear();
  }
  get yearLabel() {
    return this.year;
  }

  /** render a single cell button */
  private _cellRenderer(cell: DateCell) {
    const classes = classMap({
      interactive: true,
      'date-cell': true,
      'date-cell--today': cell.isToday,
      'date-cell--not-curr-month': cell.notCurrentMonth,
      'date-cell--selected': !!cell.selected,
      'date-cell--in-range': !!cell.inRange,
      'date-cell--range-start': !!cell.rangeStart,
      'date-cell--range-end': !!cell.rangeEnd,
    });

    const dateRaw = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}(${cell.date.getDay()})`;

    const overflow = (cell.inRange || cell.rangeStart || cell.rangeEnd)
      ? html`<div class="range-overflow"></div>`
      : nothing;

    return html`
      <button
        tabindex=${cell.tabIndex ?? -1}
        aria-label=${dateRaw}
        data-date=${dateRaw}
        class=${classes}
        @click=${this.onChange ? () => this._onChange(cell.date) : undefined}
      >
        ${cell.label}
      </button>
      ${overflow}
    `;
  }

  private _dateContent() {
    // find which week-rows hold the true start/end days
    const firstRow = this._matrix.findIndex(week =>
      week.some(c => c.rangeStart)
    );
    const lastRow = this._matrix.findIndex(week =>
      week.some(c => c.rangeEnd)
    );
    const rowCount = this._matrix.length;

    // if our selection covers from row 0 all the way to the last row,
    // treat it as a single full-grid highlight (e.g. “this month”)
    const fullCover =
      this.unit === 'year' &&
      firstRow === 0 &&
      lastRow === rowCount - 1;

    return html`
    <div class="date-picker-header">
      <div class="date-picker-header__buttons">
        <button
          class="date-picker-header__date interactive"
          @click=${() => this.toggleMonthSelector()}
        >
          <div>${this.monthLabel}</div>
        </button>
        <button
          class="date-picker-header__date interactive"
          @click=${() => this.toggleYearSelector()}
        >
          <div>${this.yearLabel}</div>
        </button>
      </div>

      ${this._navAction(
      () => this._moveMonth(-1),
      () => this._moveMonth(1),
      html`
          <button
            tabindex="0"
            aria-label="today"
            class="action-label interactive today"
            @click=${() => this._onChange(new Date())}
          >
            <span>TODAY</span>
          </button>`
    )}
    </div>

    ${this._dayHeaderRenderer()}

    <div
      class="date-picker-weeks"
      style=${styleMap({ position: 'relative' })}
    >
      ${fullCover
        ? html`
            <!-- one big rectangle behind the entire month -->
            <div
              class="range-bg"
              style=${styleMap({
          top: '0px',
          left: '0px',
          width: `${7 * this.size + 6 * this.gapH}px`,
          height: `${rowCount * this.size +
            (rowCount - 1) * this.gapV}px`,
          borderRadius: '8px',
        })}
            ></div>
          `
        : nothing}

      ${this._matrix.map((week, rowIndex) => {
          // if we're doing a fullCover, just render cells normally
          if (fullCover) {
            return html`
            <div class="date-picker-week">
              ${week.map(cell => this._cellRenderer(cell))}
            </div>
          `;
          }

          // otherwise fall back to per-row logic
          const cols = week
            .map((c, i) => (c.rangeStart || c.inRange || c.rangeEnd ? i : -1))
            .filter(i => i >= 0);

          // no highlight on this row?
          if (cols.length === 0) {
            return html`
            <div class="date-picker-week">
              ${week.map(cell => this._cellRenderer(cell))}
            </div>
          `;
          }

          const startCol = cols[0];
          const endCol = cols[cols.length - 1];
          const singleRow = firstRow === lastRow;
          const radius = singleRow
            ? '8px'
            : rowIndex === firstRow
              ? '8px 8px 0 0'
              : rowIndex === lastRow
                ? '0 0 8px 8px'
                : '0';

          const bgStyle = {
            left: `${startCol * (this.size + this.gapH)}px`,
            width: `${(endCol - startCol) * (this.size + this.gapH) + this.size
              }px`,
            borderRadius: radius,
          };

          return html`
          <div class="date-picker-week">
            <div class="range-bg" style=${styleMap(bgStyle)}></div>

            ${week.map(cell => {
            const isStart = cell.rangeStart;
            const isEnd = cell.rangeEnd;
            const showOverflow = isStart || isEnd;
            const overflowStyle = showOverflow
              ? styleMap({
                borderRadius: isStart
                  ? '8px 0 0 8px'
                  : '0 8px 8px 0',
              })
              : undefined;

            const classes = classMap({
              interactive: true,
              'date-cell': true,
              'date-cell--today': cell.isToday,
              'date-cell--not-curr-month': cell.notCurrentMonth,
              'date-cell--selected': !!cell.selected,
              // we no longer need an .in-range pill on EVERY cell,
              // so you can even drop `'date-cell--in-range': cell.inRange` here
              'date-cell--range-start': isStart,
              'date-cell--range-end': isEnd,
            });

            return html`
                <button
                  tabindex=${cell.tabIndex ?? -1}
                  aria-label=${cell.date.toISOString()}
                  class=${classes}
                  @click=${() => this._onChange(cell.date)}
                >
                  ${cell.label}
                </button>

                ${showOverflow
                ? html`
                      <div
                        class="range-overflow"
                        style=${overflowStyle}
                      ></div>`
                : nothing}
              `;
          })}
          </div>
        `;
        })}
    </div>

    ${this.onClear
        ? html`
          <div class="date-picker-footer">
            <button
              tabindex="0"
              aria-label="clear"
              class="footer-button interactive"
              @click=${() => this.onClear!()}
            >
              Clear
            </button>
          </div>`
        : nothing}
  `;
  }

  /** weekday header row */
  private _dayHeaderRenderer() {
    return html`
      <div class="days-header">
        ${days.map(d => html`<div class="date-cell">${d}</div>`)}
      </div>
    `;
  }

  /** build the matrix of DateCells */
  private _getMatrix() {
    this._matrix = getMonthMatrix(this._cursor).map(week =>
      week.map(date => {
        const t = date.getTime();
        const isInRange =
          this.rangeStart != null &&
          this.rangeEnd != null &&
          t > this.rangeStart &&
          t < this.rangeEnd;
        const isRangeStart =
          this.rangeStart != null && isSameDay(date, toDate(this.rangeStart));
        const isRangeEnd =
          this.rangeEnd != null &&
          (
            /* inclusive timestamp (any time on the same day) */
            isSameDay(date, toDate(this.rangeEnd)) ||

            /* exclusive timestamp (00:00 of next day)  →  subtract 1 ms */
            isSameDay(date, toDate(this.rangeEnd - 1))
          );
        const isSelected =
          this.rangeStart == null &&
          this.value != null &&
          isSameDay(date, toDate(this.value));
        const tabIndex = isSameDay(date, this._cursor) ? 0 : -1;

        return {
          date,
          label: date.getDate().toString(),
          isToday: isToday(date),
          notCurrentMonth: !isSameMonth(date, this._cursor),
          selected: isSelected,
          inRange: isInRange,
          rangeStart: isRangeStart,
          rangeEnd: isRangeEnd,
          tabIndex,
        } satisfies DateCell;
      })
    );
  }

  /** populate _yearMatrix with a full 12-year decade */
  private _getYearMatrix() {
    const no = Math.floor((this._yearCursor - this._minYear) / 12);
    const decade = no * 12;
    const start = this._minYear + decade;
    const end = start + 12;
    this._yearMatrix = Array.from({ length: end - start }, (_, i) => start + i)
      .filter(v => v >= this._minYear && v <= this._maxYear);
  }

  /** navigate decades in the “year” view */
  private _modeDecade(offset: number) {
    this._yearCursor = clamp(this._minYear, this._maxYear, this._yearCursor + offset);
    this._getYearMatrix();
  }

  /** month-picker view */
  private _monthContent() {
    return html`
      <div class="date-picker-header">
        <button
          class="date-picker-header__date interactive"
          @click=${() => this.toggleMonthSelector()}
        >
          <div>${this._monthPickYearCursor}</div>
        </button>
        ${this._navAction(
      { action: () => this._monthPickYearCursor--, disable: this._monthPickYearCursor <= this._minYear },
      { action: () => this._monthPickYearCursor++, disable: this._monthPickYearCursor >= this._maxYear }
    )}
      </div>
      <div class="date-picker-month">
        ${months.map((m, idx) => {
      const isActive = this.value != null && isSameMonth(this.value, new Date(this._monthPickYearCursor, idx, 1));
      const classes = classMap({ 'month-cell': true, interactive: true, active: isActive });
      return html`
            <button
              tabindex=${this._monthCursor === idx ? 0 : -1}
              aria-label=${m}
              class=${classes}
              @click=${() => {
          this._cursor.setMonth(idx);
          this._cursor.setFullYear(this._monthPickYearCursor);
          this._mode = 'date';
          this._getMatrix();
        }}
            >${m}</button>
          `;
    })}
      </div>
    `;
  }

  private _moveMonth(offset: number) {
    this._cursor.setMonth(this._cursor.getMonth() + offset);
    this._getMatrix();
  }

  /** header with prev/today/next buttons */
  private _navAction(
    prev: NavActionArg | (() => void),
    next: NavActionArg | (() => void),
    slot?: TemplateResult
  ) {
    const onPrev = typeof prev === 'function' ? prev : prev.action;
    const onNext = typeof next === 'function' ? next : next.action;
    const prevDisable = typeof prev === 'function' ? false : prev.disable;
    const nextDisable = typeof next === 'function' ? false : next.disable;
    const classes = classMap({ 'date-picker-header__action': true, 'with-slot': !!slot });
    return html`
      <div class=${classes}>
        <button
          aria-label="previous"
          class="date-picker-small-action interactive left"
          @click=${onPrev}
          ?disabled=${prevDisable}
        >${arrowLeftIcon}</button>
        ${slot ?? nothing}
        <button
          aria-label="next"
          class="date-picker-small-action interactive right"
          @click=${onNext}
          ?disabled=${nextDisable}
        >${arrowLeftIcon}</button>
      </div>
    `;
  }

  /** internal cursor (always updates UI) + optional callback */
  private _onChange(date: Date) {
    // move the calendar cursor
    this._cursor = date;
    this.value = date.getTime();
    this._getMatrix();

    // notify parent only when a callback is supplied
    this.onChange?.(date);
  }


  private _switchMode<T>(map: Record<typeof this._mode, T>) {
    return (map[this._mode] as T) ?? nothing;
  }

  /** year-picker view (with guard) */
  private _yearContent() {
    if (this._yearMatrix.length === 0) {
      this._getYearMatrix();
    }
    const startYear = this._yearMatrix[0];
    const endYear = this._yearMatrix[this._yearMatrix.length - 1];
    return html`
      <div class="date-picker-header">
        <button class="date-picker-header__date interactive" @click=${() => this.toggleYearSelector()}>
          <div>${startYear}-${endYear}</div>
        </button>
        ${this._navAction(
      { action: () => this._modeDecade(-12), disable: startYear <= this._minYear },
      { action: () => this._modeDecade(12), disable: endYear >= this._maxYear }
    )}
      </div>
      <div class="date-picker-year">
        ${this._yearMatrix.map(y => {
      const isActive = y === this._cursor.getFullYear();
      const classes = classMap({ 'year-cell': true, interactive: true, active: isActive });
      return html`
            <button
              tabindex=${this._yearCursor === y ? 0 : -1}
              aria-label=${y}
              class=${classes}
              @click=${() => {
          this._cursor.setFullYear(y);
          this._mode = 'date';
          this._getMatrix();
        }}
            >${y}</button>
          `;
    })}
      </div>
    `;
  }

  closeMonthSelector() {
    this._mode = 'date';
  }
  closeYearSelector() {
    this._mode = 'date';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.value != null) this._cursor = toDate(this.value);
    this._getMatrix();
  }

  override firstUpdated(): void {
    this._disposables.addFromEvent(
      this,
      'keydown',
      e => {
        // … existing arrow/tab/Escape handling …
        if (e.key === 'Escape') {
          this.onEscape!(toDate(this.value!));
        }
      },
      true
    );
  }

  focusDateCell() { /* … */ }
  focusMonthCell() { /* … */ }
  focusYearCell() { /* … */ }
  isDateCellFocused() { /* … */ }
  isMonthCellFocused() { /* … */ }
  isYearCellFocused() { /* … */ }
  openMonthSelector() { /* … */ }
  openYearSelector() { /* … */ }

  override render() {
    const classes = classMap({
      'date-picker': true,
      [`date-picker--mode-${this._mode}`]: true,
      popup: this.popup,
    });
    const wrapperStyle = styleMap({ 'min-height': `${this.minHeight}px` });
    return html`
      <div style=${wrapperStyle} class="date-picker-height-wrapper">
        <div class=${classes} style=${styleMap(this._cardStyle)}>
          ${this._switchMode({
      date: this._dateContent(),
      month: this._monthContent(),
      year: this._yearContent(),
    })}
        </div>
      </div>
    `;
  }

  toggleMonthSelector() {
    this._mode === 'month' ? this.closeMonthSelector() : this.openMonthSelector();
  }
  toggleYearSelector() {
    this._mode === 'year' ? this.closeYearSelector() : this.openYearSelector();
  }

  override updated(changed: PropertyValues) {
    if (changed.has('value')) {
      if (this.value != null) this._cursor = toDate(this.value);
    }

    /* rebuild cells if any range parameter changed */
    if (
      changed.has('value') ||
      changed.has('rangeStart') ||
      changed.has('rangeEnd')
    ) {
      this._getMatrix();
    }
  }

  // ──────  P R O P E R T I E S  ───────────────────────────────────────────────

  @property({ attribute: false }) private accessor _matrix: DateCell[][] = [];
  @property({ attribute: false }) private accessor _mode: 'date' | 'month' | 'year' = 'date';

  @property({ attribute: false }) accessor rangeStart: number | undefined = undefined;
  @property({ attribute: false }) accessor rangeEnd: number | undefined = undefined;

  @property({ attribute: false }) private accessor _monthCursor: number = 0;
  @property({ attribute: false }) private accessor _monthPickYearCursor: number = 0;
  @property({ attribute: false }) private accessor _yearCursor: number = 0;
  @property({ attribute: false }) private accessor _yearMatrix: number[] = [];

  @property({ type: Number }) accessor gapH: number = 10;
  @property({ type: Number }) accessor gapV: number = 8;
  @property({ type: Number }) accessor padding: number = 20;
  @property({ type: Boolean }) accessor popup: boolean = false;
  @property({ type: Number }) accessor size: number = 28;
  @property({ type: Number }) accessor value: number | undefined = undefined;

  @property({ attribute: false }) accessor onChange: ((value: Date) => void) | undefined = undefined;
  @property({ attribute: false }) accessor onClear: (() => void) | undefined = undefined;
  @property({ attribute: false }) accessor onEscape: ((value: Date) => void) | undefined = undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'date-picker': DatePicker;
  }
}
