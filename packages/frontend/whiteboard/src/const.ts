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
