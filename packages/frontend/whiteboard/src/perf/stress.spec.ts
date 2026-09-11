import { describe, expect, it } from 'vitest';

import {
  applyStressPlan,
  buildStressPlan,
  WHITEBOARD_STRESS_FIXTURE,
} from './stress';

describe('whiteboard stress fixture', () => {
  it('builds the §6.5 mix: 1k notes, 50 chart snapshots, 5 live charts, 1 sketch', () => {
    const plan = buildStressPlan();
    expect(plan.notes).toHaveLength(WHITEBOARD_STRESS_FIXTURE.notes);
    expect(plan.sketches).toHaveLength(WHITEBOARD_STRESS_FIXTURE.sketches);
    expect(plan.charts.filter(chart => chart.live)).toHaveLength(
      WHITEBOARD_STRESS_FIXTURE.liveCharts
    );
    expect(plan.charts.filter(chart => !chart.live)).toHaveLength(
      WHITEBOARD_STRESS_FIXTURE.chartSnapshots
    );
  });

  it('applies the plan through the host API', () => {
    const calls = { notes: 0, charts: 0, sketches: 0 };
    applyStressPlan(buildStressPlan({ notes: 3, chartSnapshots: 2, liveCharts: 1, sketches: 1 }), {
      addNote: () => {
        calls.notes += 1;
      },
      addChart: () => {
        calls.charts += 1;
      },
      addSketch: () => {
        calls.sketches += 1;
      },
    });
    expect(calls).toEqual({ notes: 3, charts: 3, sketches: 1 });
  });
});
