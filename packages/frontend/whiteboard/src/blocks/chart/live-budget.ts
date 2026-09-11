import { WHITEBOARD_LOD } from '../../const';
import { LiveInstanceBudget } from '../../perf/live-budget';
import { getWidgetLodLevel } from '../../perf/policy';

export type ChartLodLevel = 'l0' | 'l1' | 'l2';

export function getChartLodLevel(
  zoom: number,
  selected: boolean,
  hovered: boolean
): ChartLodLevel {
  return getWidgetLodLevel(zoom, selected, hovered);
}

/**
 * Shared live ECharts instance budget. L2 instances call acquire();
 * everyone else must render a snapshot.
 */
export class LiveChartBudget extends LiveInstanceBudget {
  constructor(maxLive = WHITEBOARD_LOD.maxLiveCharts) {
    super(maxLive);
  }
}

export const liveChartBudget = new LiveChartBudget();
