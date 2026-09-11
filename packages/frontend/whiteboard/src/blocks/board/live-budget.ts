import { WHITEBOARD_LOD } from '../../const';
import { LiveInstanceBudget } from '../../perf/live-budget';
import { getWidgetLodLevel } from '../../perf/policy';

export type BoardLodLevel = 'l0' | 'l1' | 'l2';

export function getBoardLodLevel(
  zoom: number,
  selected: boolean,
  hovered: boolean
): BoardLodLevel {
  return getWidgetLodLevel(zoom, selected, hovered);
}

/**
 * Shared live kanban (full Atlaskit data-view) budget.
 * L2 instances call acquire(); everyone else renders L0/L1.
 */
export class LiveKanbanBudget extends LiveInstanceBudget {
  constructor(maxLive = WHITEBOARD_LOD.maxLiveKanban) {
    super(maxLive);
  }
}

export const liveKanbanBudget = new LiveKanbanBudget();
