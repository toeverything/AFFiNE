import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { html } from 'lit/static-html.js';

import type { GanttDragMode } from './gantt-drag-controller.js';
import { calendarDaysBetween } from './utils.js';

const DRAG_THRESHOLD = 3;

const styles = css`
  affine-data-view-gantt-task-bar {
    display: block;
    position: absolute;
    height: 24px;
    top: 50%;
    transform: translateY(-50%);
  }

  .gantt-bar {
    height: 100%;
    border-radius: 4px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    white-space: nowrap;
    min-width: 4px;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    position: relative;
    cursor: grab;
    transition: opacity 0.15s ease;
  }

  .gantt-bar:hover {
    opacity: 0.85;
  }

  .gantt-bar:active {
    cursor: grabbing;
    opacity: 0.75;
  }

  .gantt-bar-label {
    font-size: 11px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    flex: 1;
    min-width: 0;
  }

  .gantt-bar-duration {
    font-size: 10px;
    opacity: 0.75;
    pointer-events: none;
    flex-shrink: 0;
    margin-left: 4px;
  }

  .gantt-bar.no-dates {
    display: none;
  }

  .gantt-bar-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    z-index: 1;
    transition: background 0.15s ease;
  }

  .gantt-bar-handle:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .gantt-bar-handle-left {
    left: 0;
    border-radius: 4px 0 0 4px;
  }

  .gantt-bar-handle-right {
    right: 0;
    border-radius: 0 4px 4px 0;
  }
`;

export class GanttTaskBar extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  private _didDrag = false;

  private _isHandle = false;

  @property({ attribute: false })
  accessor rowId!: string;

  @property({ attribute: false })
  accessor title!: string;

  @property({ attribute: false })
  accessor startDate!: number | null;

  @property({ attribute: false })
  accessor endDate!: number | null;

  @property({ attribute: false })
  accessor timelineStart!: Date;

  @property({ attribute: false })
  accessor dayWidth!: number;

  @property({ attribute: false })
  accessor barColor!: string | null;

  @property({ attribute: false })
  accessor onClick!: (rowId: string) => void;

  @property({ attribute: false })
  accessor onDragStart!:
    | ((
        rowId: string,
        mode: GanttDragMode,
        clientX: number,
        startDate: number,
        endDate: number
      ) => void)
    | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    this.dataset.rowId = this.rowId;
  }

  override willUpdate(): void {
    this.dataset.rowId = this.rowId;
    // Position the host element itself so elementFromPoint hits the correct bar
    if (this.hasDates) {
      this.style.left = `${this.leftPx}px`;
      this.style.width = `${this.widthPx}px`;
      this.style.pointerEvents = 'auto';
    } else {
      this.style.pointerEvents = 'none';
      this.style.width = '0';
    }
  }

  private get hasDates(): boolean {
    return this.startDate != null && this.endDate != null;
  }

  private get leftPx(): number {
    if (this.startDate == null) return 0;
    const start = new Date(this.startDate);
    return calendarDaysBetween(this.timelineStart, start) * this.dayWidth;
  }

  private get durationDays(): number {
    if (this.startDate == null || this.endDate == null) return 0;
    // +1 because a task from March 10 to March 12 spans 3 calendar days
    return Math.max(
      1,
      Math.ceil(
        calendarDaysBetween(new Date(this.startDate), new Date(this.endDate))
      ) + 1
    );
  }

  private get widthPx(): number {
    return this.durationDays * this.dayWidth;
  }

  private readonly handleClick = (e: MouseEvent) => {
    if (this._didDrag || this._isHandle) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    this.onClick?.(this.rowId);
  };

  private readonly handlePointerDown = (
    mode: GanttDragMode,
    e: PointerEvent
  ) => {
    if (this.startDate == null || this.endDate == null || !this.onDragStart)
      return;

    e.preventDefault();
    e.stopPropagation();

    this._didDrag = false;
    this._isHandle = mode !== 'move';
    const startX = e.clientX;
    const startDate = this.startDate;
    const endDate = this.endDate;
    const onDragStart = this.onDragStart;
    const rowId = this.rowId;
    let dragStarted = false;

    const onPointerMove = (ev: PointerEvent) => {
      const delta = Math.abs(ev.clientX - startX);
      if (!dragStarted && delta >= DRAG_THRESHOLD) {
        dragStarted = true;
        this._didDrag = true;
        onDragStart(rowId, mode, startX, startDate, endDate);
      }
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      // Reset flags after click event fires (click fires after pointerup)
      requestAnimationFrame(() => {
        this._didDrag = false;
        this._isHandle = false;
      });
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  override render(): TemplateResult {
    if (!this.hasDates) {
      return html`<div class="gantt-bar no-dates"></div>`;
    }

    const bg = this.barColor || 'var(--affine-primary-color)';

    return html`
      <div
        class="gantt-bar"
        style="background: ${bg}; color: #fff;"
        @click="${this.handleClick}"
        @pointerdown="${(e: PointerEvent) => this.handlePointerDown('move', e)}"
      >
        <div
          class="gantt-bar-handle gantt-bar-handle-left"
          @pointerdown="${(e: PointerEvent) =>
            this.handlePointerDown('resize-left', e)}"
        ></div>
        <span class="gantt-bar-label">${this.title}</span>
        <span class="gantt-bar-duration">(${this.durationDays}d)</span>
        <div
          class="gantt-bar-handle gantt-bar-handle-right"
          @pointerdown="${(e: PointerEvent) =>
            this.handlePointerDown('resize-right', e)}"
        ></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-gantt-task-bar': GanttTaskBar;
  }
}
