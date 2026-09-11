import { WHITEBOARD_LOD } from '../../const';

export type BoardLodLevel = 'l0' | 'l1' | 'l2';

export function getBoardLodLevel(
  zoom: number,
  selected: boolean,
  hovered: boolean
): BoardLodLevel {
  if (selected || (hovered && zoom > WHITEBOARD_LOD.z1)) {
    return 'l2';
  }
  if (zoom < WHITEBOARD_LOD.z0) {
    return 'l0';
  }
  return 'l1';
}

/**
 * Shared live kanban (full Atlaskit data-view) budget.
 * L2 instances call acquire(); everyone else renders L0/L1.
 */
export class LiveKanbanBudget {
  readonly maxLive: number;

  private readonly live = new Set<string>();
  private readonly exempt = new Set<string>();

  constructor(maxLive = WHITEBOARD_LOD.maxLiveKanban) {
    this.maxLive = maxLive;
  }

  get size() {
    return this.live.size;
  }

  has(id: string) {
    return this.live.has(id);
  }

  acquire(id: string, liveBudgetExempt = false): boolean {
    if (this.live.has(id)) return true;
    if (liveBudgetExempt) {
      this.exempt.add(id);
      this.live.add(id);
      return true;
    }
    const nonExempt = [...this.live].filter(item => !this.exempt.has(item));
    if (nonExempt.length >= this.maxLive) return false;
    this.live.add(id);
    return true;
  }

  release(id: string) {
    this.live.delete(id);
    this.exempt.delete(id);
  }

  reset() {
    this.live.clear();
    this.exempt.clear();
  }
}

export const liveKanbanBudget = new LiveKanbanBudget();
