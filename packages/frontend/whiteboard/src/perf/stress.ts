import {
  BOARD_WIDGET_SIZE,
  CHART_WIDGET_SIZE,
  SKETCH_WIDGET_SIZE,
} from '../const';

/** Plan §6.5 stress board: 1k notes, 50 chart snapshots, 5 live charts, 1 sketch. */
export const WHITEBOARD_STRESS_FIXTURE = {
  notes: 1000,
  chartSnapshots: 50,
  liveCharts: 5,
  sketches: 1,
} as const;

export type StressNote = { xywh: string; text: string };
export type StressChart = { xywh: string; live: boolean; title: string };
export type StressSketch = { xywh: string; title: string };

export type StressPlan = {
  notes: StressNote[];
  charts: StressChart[];
  sketches: StressSketch[];
};

function cell(index: number, width: number, height: number, columns = 20) {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = 40 + col * (width + 24);
  const y = 40 + row * (height + 24);
  return `[${x},${y},${width},${height}]`;
}

export function buildStressPlan(
  counts: Partial<typeof WHITEBOARD_STRESS_FIXTURE> = {}
): StressPlan {
  const notes = counts.notes ?? WHITEBOARD_STRESS_FIXTURE.notes;
  const chartSnapshots =
    counts.chartSnapshots ?? WHITEBOARD_STRESS_FIXTURE.chartSnapshots;
  const liveCharts = counts.liveCharts ?? WHITEBOARD_STRESS_FIXTURE.liveCharts;
  const sketches = counts.sketches ?? WHITEBOARD_STRESS_FIXTURE.sketches;

  return {
    notes: Array.from({ length: notes }, (_, index) => ({
      xywh: cell(index, 200, 80),
      text: `Note ${index + 1}`,
    })),
    charts: [
      ...Array.from({ length: liveCharts }, (_, index) => ({
        xywh: cell(index, CHART_WIDGET_SIZE.width, CHART_WIDGET_SIZE.height, 5),
        live: true,
        title: `Live chart ${index + 1}`,
      })),
      ...Array.from({ length: chartSnapshots }, (_, index) => ({
        xywh: cell(
          liveCharts + index,
          CHART_WIDGET_SIZE.width,
          CHART_WIDGET_SIZE.height,
          5
        ),
        live: false,
        title: `Chart snapshot ${index + 1}`,
      })),
    ],
    sketches: Array.from({ length: sketches }, (_, index) => ({
      xywh: cell(
        index,
        SKETCH_WIDGET_SIZE.width,
        SKETCH_WIDGET_SIZE.height,
        2
      ),
      title: `Sketch ${index + 1}`,
    })),
  };
}

export type StressApplier = {
  addNote: (note: StressNote) => void;
  addChart: (chart: StressChart) => void;
  addSketch: (sketch: StressSketch) => void;
};

export function applyStressPlan(plan: StressPlan, api: StressApplier) {
  for (const note of plan.notes) api.addNote(note);
  for (const chart of plan.charts) api.addChart(chart);
  for (const sketch of plan.sketches) api.addSketch(sketch);
}

export const STRESS_BOARD_SIZE = BOARD_WIDGET_SIZE;
