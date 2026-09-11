import { NoteDisplayMode } from '@blocksuite/affine/model';
import { type Store, Text } from '@blocksuite/affine/store';

import {
  BOARD_WIDGET_SIZE,
  CHART_WIDGET_SIZE,
  SKETCH_WIDGET_SIZE,
  WHITEBOARD_FLAVOURS,
} from '../const';

export interface StressFixtureCounts {
  notes: number;
  chartSnapshots: number;
  liveCharts: number;
  sketches: number;
}

/** Plan §6.5 stress board: 1k notes, 50 chart snapshots, 5 live charts, 1 sketch. */
export const WHITEBOARD_STRESS_FIXTURE: StressFixtureCounts = {
  notes: 1000,
  chartSnapshots: 50,
  liveCharts: 5,
  sketches: 1,
};

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
  counts: Partial<StressFixtureCounts> = {}
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
      xywh: cell(index, SKETCH_WIDGET_SIZE.width, SKETCH_WIDGET_SIZE.height, 2),
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

export type StressBlockNode = {
  id: string;
  flavour: string;
  children: readonly StressBlockNode[];
};

/** The slice of `Store` the fixtures write through, so tests can pass a double. */
export interface StressStore {
  readonly root: StressBlockNode | null;
  addBlock(
    flavour: string,
    props: Record<string, unknown>,
    parent?: StressBlockNode | string | null,
    parentIndex?: number
  ): string;
}

export function createStoreStressApplier(store: StressStore): StressApplier {
  const root = store.root;
  if (!root) {
    throw new Error('stress fixtures need a loaded root block');
  }
  const surface = root.children.find(
    child => child.flavour === 'affine:surface'
  );
  if (!surface) {
    throw new Error('stress fixtures need an edgeless surface');
  }

  return {
    addNote(note) {
      const noteId = store.addBlock(
        'affine:note',
        {
          xywh: note.xywh,
          displayMode: NoteDisplayMode.EdgelessOnly,
        },
        root.id
      );
      store.addBlock('affine:paragraph', { text: new Text(note.text) }, noteId);
    },
    addChart(chart) {
      store.addBlock(
        WHITEBOARD_FLAVOURS.chart,
        {
          xywh: chart.xywh,
          title: new Text(chart.title),
          // The fixture wants 5 live charts while `maxLiveCharts` is 3, so the
          // live ones have to opt out of the budget.
          liveBudgetExempt: chart.live,
        },
        surface.id
      );
    },
    addSketch(sketch) {
      store.addBlock(
        WHITEBOARD_FLAVOURS.sketch,
        {
          xywh: sketch.xywh,
          title: new Text(sketch.title),
        },
        surface.id
      );
    },
  };
}

/** Materialises the §6.5 stress board into a real edgeless document. */
export function applyStressFixture(
  store: Store,
  counts: Partial<StressFixtureCounts> = {}
) {
  applyStressPlan(buildStressPlan(counts), createStoreStressApplier(store));
}

export const STRESS_BOARD_SIZE = BOARD_WIDGET_SIZE;
