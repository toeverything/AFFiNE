export type StandardCursor =
  | 'default'
  | 'pointer'
  | 'move'
  | 'text'
  | 'crosshair'
  | 'not-allowed'
  | 'grab'
  | 'grabbing'
  | 'nwse-resize'
  | 'nesw-resize'
  | 'ew-resize'
  | 'ns-resize'
  | 'n-resize'
  | 's-resize'
  | 'w-resize'
  | 'e-resize'
  | 'ne-resize'
  | 'se-resize'
  | 'sw-resize'
  | 'nw-resize'
  | 'zoom-in'
  | 'zoom-out'
  | 'help'
  | 'wait'
  | 'progress'
  | 'copy'
  | 'alias'
  | 'context-menu'
  | 'cell'
  | 'vertical-text'
  | 'no-drop'
  | 'not-allowed'
  | 'all-scroll'
  | 'col-resize'
  | 'row-resize'
  | 'none'
  | 'inherit'
  | 'initial'
  | 'unset';

export type URLCursor = `url(${string})`;

export type URLCursorWithCoords = `url(${string}) ${number} ${number}`;

export type URLCursorWithFallback =
  | `${URLCursor}, ${StandardCursor}`
  | `${URLCursorWithCoords}, ${StandardCursor}`;

export type CursorType =
  | StandardCursor
  | URLCursor
  | URLCursorWithCoords
  | URLCursorWithFallback;
