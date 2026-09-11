export const WHITEBOARD_FLAVOURS = {
  hello: 'wb:hello',
  chart: 'wb:chart',
  sketch: 'wb:sketch',
  board: 'wb:board',
} as const;

export type WhiteboardFlavour =
  (typeof WHITEBOARD_FLAVOURS)[keyof typeof WHITEBOARD_FLAVOURS];

export const WHITEBOARD_SURFACE_CHILDREN = [
  'wb:*',
  WHITEBOARD_FLAVOURS.hello,
  WHITEBOARD_FLAVOURS.chart,
  WHITEBOARD_FLAVOURS.sketch,
  WHITEBOARD_FLAVOURS.board,
] as const;

export const HELLO_WIDGET_SIZE = {
  width: 280,
  height: 160,
} as const;

export const CHART_WIDGET_SIZE = {
  width: 480,
  height: 320,
} as const;

/** LOD and live-instance budgets from the whiteboard plan §5.4. */
export const BOARD_WIDGET_SIZE = {
  width: 720,
  height: 420,
} as const;

export const SKETCH_WIDGET_SIZE = {
  width: 560,
  height: 360,
} as const;

/**
 * Tuning knobs, not discriminants: typed as `number` so the defaults do not
 * leak literal types into the signatures of the helpers that consume them.
 */
export interface WhiteboardLodConfig {
  /** Below this zoom a widget renders as L0 (bitmap / placeholder). */
  z0: number;
  /** Above this zoom a hovered widget may be promoted to L2 (live). */
  z1: number;
  maxLiveCharts: number;
  maxLiveKanban: number;
  maxLiveSketches: number;
  /** Cards rendered per column at L1 before the "+N" overflow chip. */
  l1KanbanCards: number;
  kanbanCardEstimatePx: number;
  kanbanColumnEstimatePx: number;
  virtualOverscan: number;
}

export const WHITEBOARD_LOD: WhiteboardLodConfig = {
  z0: 0.35,
  z1: 0.7,
  maxLiveCharts: 3,
  maxLiveKanban: 2,
  maxLiveSketches: 1,
  l1KanbanCards: 4,
  kanbanCardEstimatePx: 44,
  kanbanColumnEstimatePx: 160,
  virtualOverscan: 1,
};
