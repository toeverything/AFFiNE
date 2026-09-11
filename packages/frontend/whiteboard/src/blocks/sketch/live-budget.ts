import { WHITEBOARD_LOD } from '../../const';
import { LiveInstanceBudget } from '../../perf/live-budget';
import { getWidgetLodLevel } from '../../perf/policy';

export type SketchLodLevel = 'l0' | 'l1' | 'l2';

export function getSketchLodLevel(
  zoom: number,
  selected: boolean,
  hovered: boolean
): SketchLodLevel {
  return getWidgetLodLevel(zoom, selected, hovered);
}

export class LiveSketchBudget extends LiveInstanceBudget {
  constructor(maxLive = WHITEBOARD_LOD.maxLiveSketches) {
    super(maxLive);
  }
}

export const liveSketchBudget = new LiveSketchBudget();
