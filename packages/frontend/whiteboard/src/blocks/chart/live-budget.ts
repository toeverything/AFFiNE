import { WHITEBOARD_LOD } from '../../const';
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
export class LiveChartBudget {
  readonly maxLive: number;

  private readonly live = new Set<string>();
  private readonly exempt = new Set<string>();

  constructor(maxLive = WHITEBOARD_LOD.maxLiveCharts) {
    this.maxLive = maxLive;
  }

  get size() {
    return this.live.size;
  }

  has(id: string) {
    return this.live.has(id);
  }

  acquire(
    id: string,
    liveBudgetExempt = false,
    opts: boolean | { steal?: boolean; score?: number } = false
  ): boolean {
    const steal = typeof opts === 'boolean' ? opts : !!opts.steal;
    if (this.live.has(id)) return true;
    if (liveBudgetExempt) {
      this.exempt.add(id);
      this.live.add(id);
      return true;
    }
    const nonExempt = [...this.live].filter(item => !this.exempt.has(item));
    if (nonExempt.length >= this.maxLive) {
      if (!steal) return false;
      const victim = nonExempt[0];
      if (victim) this.release(victim);
    }
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

export const liveChartBudget = new LiveChartBudget();
