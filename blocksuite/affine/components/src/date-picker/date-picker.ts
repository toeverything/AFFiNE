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

export interface DateCell {
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
 * Date picker
 */
export class DatePicker extends WithDisposable(LitElement) {
  static override styles = datePickerStyle;

  /** current active month */
  private _cursor = new Date();

  private readonly _maxYear = 2099;

  private readonly _minYear = 1970;

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
    const rowNum = 7;
    return this.size * rowNum + this.padding * 2 + this.gapV * (rowNum - 1) - 2;
  }

  get cardWidth() {
    const colNum = 7;
    return this.size * colNum + this.padding * 2 + this.gapH * (colNum - 1);
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
    const rowNum = this._matrix.length;
    return this.size * rowNum + this.padding * 2 + this.gapV * (rowNum - 1) - 2;
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

  /** Cell */
  private _cellRenderer(cell: DateCell) {
    const classes = classMap({
      interactive: true,
      'date-cell': true,
      'date-cell--today': cell.isToday,
      'date-cell--not-curr-month': cell.notCurrentMonth,
      'date-cell--selected': !!cell.selected,
    });
    const dateRaw = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}(${cell.date.getDay()})`;
    return html`<button
      tabindex=${cell.tabIndex ?? -1}
      aria-label=${dateRaw}
      data-date=${dateRaw}
      class=${classes}
      @click=${() => {
        this._onChange(cell.date);
      }}
    >
      ${cell.label}
    </button>`;
  }

  private _dateContent() {
    return html` <div class="date-picker-header">
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
          html`<button
            tabindex="0"
            aria-label="today"
            class="action-label interactive today"
            @click=${() => {
              this._onChange(new Date());
            }}
          >
            <span>TODAY</span>
          </button>`
        )}
      </div>
      ${this._dayHeaderRenderer()}
      <div class="date-picker-weeks">
        ${this._matrix.map(
          week =>
            html`<div class="date-picker-week">
              ${week.map(cell => this._cellRenderer(cell))}
            </div>`
        )}
      </div>
      ${this.onClear
        ? html`<div class="date-picker-footer">
            <button
              tabindex="0"
              aria-label="clear"
              class="footer-button interactive"
              @click=${() => this.onClear?.()}
            >
              Clear
            </button>
          </div>`
        : nothing}`;
  }

  /** Week header */
  private _dayHeaderRenderer() {
    return html`<div class="days-header">
      ${days.map(day => html`<div class="date-cell">${day}</div>`)}
    </div>`;
  }

  private _getMatrix() {
    this._matrix = getMonthMatrix(this._cursor).map(row => {
      return row.map(date => {
        const tabIndex = isSameDay(date, this._cursor) ? 0 : -1;
        return {
          date,
          label: date.getDate().toString(),
          isToday: isToday(date),
          notCurrentMonth: !isSameMonth(date, this._cursor),
          selected: this.value ? isSameDay(date, toDate(this.value)) : false,
          tabIndex,
        } satisfies DateCell;
      });
    });
  }

  private _getYearMatrix() {
    // every decade has 12 years
    const no = Math.floor((this._yearCursor - this._minYear) / 12);
    const decade = no * 12;
    const start = this._minYear + decade;
    const end = start + 12;
    this._yearMatrix = Array.from(
      { length: end - start },
      (_, i) => start + i
    ).filter(v => v >= this._minYear && v <= this._maxYear);
  }

  private _modeDecade(offset: number) {
    this._yearCursor = clamp(
      this._yearCursor + offset,
      this._minYear,
      this._maxYear
    );
    this._getYearMatrix();
  }

  private _monthContent() {
    return html` <div class="date-picker-header">
        <button
          class="date-picker-header__date interactive"
          @click=${() => this.toggleMonthSelector()}
        >
          <div>${this._monthPickYearCursor}</div>
        </button>

        ${this._navAction(
          {
            action: () => this._monthPickYearCursor--,
            disable: this._monthPickYearCursor <= this._minYear,
          },
          {
            action: () => this._monthPickYearCursor++,
            disable: this._monthPickYearCursor >= this._maxYear,
          }
        )}
      </div>
      <div class="date-picker-month">
        ${months.map((month, index) => {
          const isActive = this.value
            ? isSameMonth(
                this.value,
                new Date(this._monthPickYearCursor, index, 1)
              )
            : false;
          const classes = classMap({
            'month-cell': true,
            interactive: true,
            active: isActive,
          });
          return html`<button
            tabindex=${this._monthCursor === index ? 0 : -1}
            aria-label=${month}
            class=${classes}
            @click=${() => {
              this._cursor.setMonth(index);
              this._cursor.setFullYear(this._monthPickYearCursor);
              this._mode = 'date';
              this._getMatrix();
            }}
          >
            ${month}
          </button>`;
        })}
      </div>`;
  }

  private _moveMonth(offset: number) {
    this._cursor.setMonth(this._cursor.getMonth() + offset);
    this._getMatrix();
  }

  /** Actions */
  private _navAction(
    prev: NavActionArg | NavActionArg['action'],
    curr: NavActionArg | NavActionArg['action'],
    slot?: TemplateResult
  ) {
    const onPrev = typeof prev === 'function' ? prev : prev.action;
    const onNext = typeof curr === 'function' ? curr : curr.action;
    const prevDisable = typeof prev === 'function' ? false : prev.disable;
    const nextDisable = typeof curr === 'function' ? false : curr.disable;
    const classes = classMap({
      'date-picker-header__action': true,
      'with-slot': !!slot,
    });
    return html`<div class=${classes}>
      <button
        aria-label="previous month"
        class="date-picker-small-action interactive left"
        @click=${onPrev}
        ?disabled=${prevDisable}
      >
        ${arrowLeftIcon}
      </button>
      ${slot ?? nothing}
      <button
        aria-label="next month"
        class="date-picker-small-action interactive right"
        @click=${onNext}
        ?disabled=${nextDisable}
      >
        ${arrowLeftIcon}
      </button>
    </div>`;
  }

  private _onChange(date: Date, emit = true) {
    this._cursor = date;
    this.value = date.getTime();
    this._getMatrix();
    emit && this.onChange?.(date);
  }

  private _switchMode<T>(map: Record<typeof this._mode, T>) {
    return (map[this._mode] as T) ?? nothing;
  }

  private _yearContent() {
    const startYear = this._yearMatrix[0];
    const endYear = this._yearMatrix[this._yearMatrix.length - 1];
    return html`<div class="date-picker-header">
        <button
          class="date-picker-header__date interactive"
          @click=${() => this.toggleYearSelector()}
        >
          <div>${startYear}-${endYear}</div>
        </button>
        ${this._navAction(
          {
            action: () => this._modeDecade(-12),
            disable: startYear <= this._minYear,
          },
          {
            action: () => this._modeDecade(12),
            disable: endYear >= this._maxYear,
          }
        )}
      </div>
      <div class="date-picker-year">
        ${this._yearMatrix.map(year => {
          const isActive = year === this._cursor.getFullYear();
          const classes = classMap({
            'year-cell': true,
            interactive: true,
            active: isActive,
          });
          return html`<button
            tabindex=${this._yearCursor === year ? 0 : -1}
            aria-label=${year}
            class=${classes}
            @click=${() => {
              this._cursor.setFullYear(year);
              this._mode = 'date';
              this._getMatrix();
            }}
          >
            ${year}
          </button>`;
        })}
      </div>`;
  }

  closeMonthSelector() {
    this._mode = 'date';
  }

  closeYearSelector() {
    this._mode = 'date';
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.value) this._cursor = toDate(this.value);
    this._getMatrix();
  }

  override firstUpdated(): void {
    this._disposables.addFromEvent(
      this,
      'keydown',
      e => {
        e.stopPropagation();
        const directions = new Set([
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
        ]);
        if (directions.has(e.key) && this.isDateCellFocused()) {
          e.preventDefault();

          if (e.key === 'ArrowLeft') {
            this._cursor.setDate(this._cursor.getDate() - 1);
          } else if (e.key === 'ArrowRight') {
            this._cursor.setDate(this._cursor.getDate() + 1);
          } else if (e.key === 'ArrowUp') {
            this._cursor.setDate(this._cursor.getDate() - 7);
          } else if (e.key === 'ArrowDown') {
            this._cursor.setDate(this._cursor.getDate() + 7);
          }
          this._getMatrix();
          setTimeout(this.focusDateCell.bind(this));
        }

        if (directions.has(e.key) && this.isMonthCellFocused()) {
          e.preventDefault();
          if (e.key === 'ArrowLeft') {
            this._monthCursor = (this._monthCursor - 1 + 12) % 12;
          } else if (e.key === 'ArrowRight') {
            this._monthCursor = (this._monthCursor + 1) % 12;
          } else if (e.key === 'ArrowUp') {
            this._monthCursor = (this._monthCursor - 3 + 12) % 12;
          } else if (e.key === 'ArrowDown') {
            this._monthCursor = (this._monthCursor + 3) % 12;
          }
          setTimeout(this.focusMonthCell.bind(this));
        }

        if (directions.has(e.key) && this.isYearCellFocused()) {
          e.preventDefault();
          if (e.key === 'ArrowLeft') {
            this._modeDecade(-1);
          } else if (e.key === 'ArrowRight') {
            this._modeDecade(1);
          } else if (e.key === 'ArrowUp') {
            this._modeDecade(-3);
          } else if (e.key === 'ArrowDown') {
            this._modeDecade(3);
          }
          setTimeout(this.focusYearCell.bind(this));
        }

        if (e.key === 'Tab') {
          setTimeout(() => {
            const focused = this.shadowRoot?.activeElement as HTMLElement;
            const firstEl = this.shadowRoot?.querySelector('button');

            // check if focus the last element, then focus the first element
            if (!e.shiftKey && !focused) firstEl?.focus();
            // check if focused element is inside current date-picker
            if (e.shiftKey && !this.shadowRoot?.contains(focused))
              this.focusDateCell();
          });
        }

        if (e.key === 'Escape') {
          this.onEscape?.(toDate(this.value));
        }
      },
      true
    );
  }

  /**
   * Focus on date-cell
   */
  focusDateCell() {
    const lastEl = this.shadowRoot?.querySelector(
      'button.date-cell[tabindex="0"]'
    ) as HTMLElement;
    lastEl?.focus();
  }

  focusMonthCell() {
    const lastEl = this.shadowRoot?.querySelector(
      'button.month-cell[tabindex="0"]'
    ) as HTMLElement;
    lastEl?.focus();
  }

  focusYearCell() {
    const lastEl = this.shadowRoot?.querySelector(
      'button.year-cell[tabindex="0"]'
    ) as HTMLElement;
    lastEl?.focus();
  }

  /**
   * check if date-cell is focused
   * @returns
   */
  isDateCellFocused() {
    const focused = this.shadowRoot?.activeElement as HTMLElement;
    return focused?.classList.contains('date-cell');
  }

  isMonthCellFocused() {
    const focused = this.shadowRoot?.activeElement as HTMLElement;
    return focused?.classList.contains('month-cell');
  }

  isYearCellFocused() {
    const focused = this.shadowRoot?.activeElement as HTMLElement;
    return focused?.classList.contains('year-cell');
  }

  openMonthSelector() {
    this._monthCursor = this.month;
    this._monthPickYearCursor = this.year;
    this._mode = 'month';
  }

  openYearSelector() {
    this._yearCursor = clamp(this.year, this._minYear, this._maxYear);
    this._mode = 'year';
    this._getYearMatrix();
  }

  override render() {
    const classes = classMap({
      'date-picker': true,
      [`date-picker--mode-${this._mode}`]: true,
      popup: this.popup,
    });
    const wrapperStyle = styleMap({
      'min-height': `${this.minHeight}px`,
    });
    return html`<div style=${wrapperStyle} class="date-picker-height-wrapper">
      <div class=${classes} style=${styleMap(this._cardStyle)}>
        ${this._switchMode({
          date: this._dateContent(),
          month: this._monthContent(),
          year: this._yearContent(),
        })}
      </div>
    </div>`;
  }

  toggleMonthSelector() {
    if (this._mode === 'month') this.closeMonthSelector();
    else this.openMonthSelector();
  }

  toggleYearSelector() {
    if (this._mode === 'year') this.closeYearSelector();
    else this.openYearSelector();
  }

  override updated(_changedProperties: PropertyValues): void {
    if (_changedProperties.has('value')) {
      // this._getMatrix();
      if (this.value) this._onChange(toDate(this.value), false);
      else this._getMatrix();
    }
  }

  /** date matrix */
  @property({ attribute: false })
  private accessor _matrix: DateCell[][] = [];

  @property({ attribute: false })
  private accessor _mode: 'date' | 'month' | 'year' = 'date';

  /** web-accessibility for month select */
  @property({ attribute: false })
  private accessor _monthCursor = 0;

  @property({ attribute: false })
  private accessor _monthPickYearCursor = 0;

  @property({ attribute: false })
  private accessor _yearCursor = 0;

  @property({ attribute: false })
  private accessor _yearMatrix: number[] = [];

  /** horizontal gap between cells in px */
  @property({ type: Number })
  accessor gapH = 10;

  /** vertical gap between cells in px */
  @property({ type: Number })
  accessor gapV = 8;

  @property({ attribute: false })
  accessor onChange: ((value: Date) => void) | undefined = undefined;

  @property({ attribute: false })
  accessor onClear: (() => void) | undefined = undefined;

  @property({ attribute: false })
  accessor onEscape: ((value: Date) => void) | undefined = undefined;

  /** card padding in px */
  @property({ type: Number })
  accessor padding = 20;

  @property({ type: Boolean })
  accessor popup: boolean = false;

  /** cell size in px */
  @property({ type: Number })
  accessor size = 28;

  /** Checked date timestamp */
  @property({ type: Number })
  accessor value: number | undefined = undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'date-picker': DatePicker;
  }
}
