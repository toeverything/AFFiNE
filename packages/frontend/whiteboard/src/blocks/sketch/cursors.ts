export const SKETCH_AWARENESS_KEY = 'wbSketch';

export type SketchPointerButton = 'up' | 'down';

export type SketchAwarenessPayload = {
  flavour?: string;
  blockId?: string;
  pointer?: { x: number; y: number; button?: SketchPointerButton };
  color?: string;
};

export type SketchRemoteCursor = {
  clientId: number;
  name: string;
  color: string;
  x: number;
  y: number;
  button?: SketchPointerButton;
};

const CURSOR_COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
];

export function colorForClient(clientId: number) {
  return CURSOR_COLORS[Math.abs(clientId) % CURSOR_COLORS.length] ?? '#2563eb';
}

export function readSketchCursors(
  states: Map<
    number,
    {
      user?: { name?: string };
      [SKETCH_AWARENESS_KEY]?: SketchAwarenessPayload;
    }
  >,
  blockId: string,
  localClientId?: number
): { editors: string[]; cursors: SketchRemoteCursor[] } {
  const editors: string[] = [];
  const cursors: SketchRemoteCursor[] = [];
  states.forEach((state, clientId) => {
    const sketch = state[SKETCH_AWARENESS_KEY];
    if (!sketch?.blockId || sketch.blockId !== blockId) return;
    if (clientId === localClientId) return;
    const name = state.user?.name || `#${clientId}`;
    const color = sketch.color || colorForClient(clientId);
    editors.push(name);
    if (sketch.pointer) {
      cursors.push({
        clientId,
        name,
        color,
        x: sketch.pointer.x,
        y: sketch.pointer.y,
        button: sketch.pointer.button,
      });
    }
  });
  return { editors, cursors };
}

export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  ms: number
): T & { cancel: () => void } {
  let last = 0;
  let timer = 0;
  let pending: Parameters<T> | null = null;
  const invoke = () => {
    timer = 0;
    last = Date.now();
    if (pending) {
      const args = pending;
      pending = null;
      fn(...args);
    }
  };
  const wrapped = ((...args: Parameters<T>) => {
    const now = Date.now();
    pending = args;
    if (now - last >= ms) {
      invoke();
      return;
    }
    if (!timer) {
      timer = setTimeout(invoke, ms - (now - last)) as unknown as number;
    }
  }) as T & { cancel: () => void };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    pending = null;
  };
  return wrapped;
}
