import type { GanttViewUILogic } from './gantt-view-ui-logic.js';

export type GanttDragMode = 'move' | 'resize-left' | 'resize-right';

interface DragState {
  rowId: string;
  mode: GanttDragMode;
  startX: number;
  originalStartDate: number;
  originalEndDate: number;
}

export class GanttDragController {
  private dragState: DragState | null = null;

  constructor(private readonly logic: GanttViewUILogic) {}

  get view() {
    return this.logic.view;
  }

  private get dayWidth(): number {
    return this.logic.dayWidth$.value;
  }

  startDrag(
    rowId: string,
    mode: GanttDragMode,
    clientX: number,
    startDate: number,
    endDate: number
  ) {
    this.dragState = {
      rowId,
      mode,
      startX: clientX,
      originalStartDate: startDate,
      originalEndDate: endDate,
    };

    this.view.lockRows(true);

    const onPointerMove = (e: PointerEvent) => {
      this.onDrag(e.clientX);
    };

    const onPointerUp = () => {
      this.view.lockRows(false);
      this.dragState = null;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      this.logic.ui$.value?.requestUpdate();
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  private onDrag(clientX: number) {
    const state = this.dragState;
    if (!state) return;

    const deltaX = clientX - state.startX;
    const deltaDays = Math.round(deltaX / this.dayWidth);
    const deltaMs = deltaDays * 24 * 60 * 60 * 1000;

    const startColId = this.view.startDateColumnId$.value;
    const endColId = this.view.endDateColumnId$.value;
    if (!startColId || !endColId) return;

    switch (state.mode) {
      case 'move': {
        const newStart = state.originalStartDate + deltaMs;
        const newEnd = state.originalEndDate + deltaMs;
        this.view.cellGetOrCreate(state.rowId, startColId).valueSet(newStart);
        this.view.cellGetOrCreate(state.rowId, endColId).valueSet(newEnd);
        break;
      }
      case 'resize-left': {
        const newStart = state.originalStartDate + deltaMs;
        // Don't allow start to go past end
        if (newStart <= state.originalEndDate) {
          this.view.cellGetOrCreate(state.rowId, startColId).valueSet(newStart);
        }
        break;
      }
      case 'resize-right': {
        const newEnd = state.originalEndDate + deltaMs;
        // Don't allow end to go before start
        if (newEnd >= state.originalStartDate) {
          this.view.cellGetOrCreate(state.rowId, endColId).valueSet(newEnd);
        }
        break;
      }
    }

    this.logic.ui$.value?.requestUpdate();
  }
}
