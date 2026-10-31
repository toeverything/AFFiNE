/**
 * Debug-only capture-and-transport for verbose `console.debug` instrumentation
 * emitted by mobile-specific code (notably the keyboard-toolbar's Y-positioning
 * logic in `blocksuite/affine/widgets/keyboard-toolbar`).
 *
 * BlockSuite packages must not import AFFiNE app-shell code, so the only
 * bridge between blocksuite instrumentation and this HTTP transport is the
 * global `console.debug` function itself: instrumentation call sites just
 * call plain `console.debug(MARKER, ...)`, and this module monkey-patches
 * `console.debug` (once, from the app shell) to also capture and forward
 * matching calls — while always still calling the original console.debug
 * first, so on-device Safari remote debugging keeps seeing every call live.
 */

export const MARKER = '[MobileDebugLog]';

const STORAGE_KEY = 'affine-mobile-debug-log-client-id';
const COLLECT_ENDPOINT = '/api/mobile-debug-log/collect';
const MAX_BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 2000;

interface BufferedEntry {
  message: string;
  timestampMs: number;
}

function getOrCreateClientId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // localStorage may throw (e.g. private-browsing restrictions) — fall
    // back to an in-memory-only id for the lifetime of this page load.
    return crypto.randomUUID();
  }
}

function serializeArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function installMobileDebugLogCapture(): () => void {
  const clientId = getOrCreateClientId();
  const buffer: BufferedEntry[] = [];
  const originalConsoleDebug = console.debug.bind(console);

  function flush() {
    if (buffer.length === 0) return;
    const entries = buffer.splice(0, buffer.length);
    fetch(COLLECT_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, entries }),
    }).catch(() => {
      // Best-effort debug telemetry: disabled endpoint, unauthenticated,
      // offline, whatever — never allowed to throw into the app.
    });
  }

  console.debug = (...args: unknown[]) => {
    originalConsoleDebug(...args);

    if (typeof args[0] !== 'string' || !args[0].startsWith(MARKER)) {
      return;
    }

    const message = args.map(serializeArg).join(' ');
    buffer.push({ message, timestampMs: Date.now() });

    if (buffer.length >= MAX_BATCH_SIZE) {
      flush();
    }
  };

  const intervalId = setInterval(flush, FLUSH_INTERVAL_MS);

  return () => {
    clearInterval(intervalId);
    console.debug = originalConsoleDebug;
  };
}

/**
 * keyboard-focus-tabbar-coordination (round 2): diagnostic-only global
 * pointer capture, requested to help diagnose the "keyboard-toggle button
 * only occasionally closes the keyboard, suspect clicks landing on the
 * wrong element" report. Logs `clientX`/`clientY` plus BOTH the element
 * that actually received the event (`event.target`) and the element a
 * plain hit-test at that same point would find
 * (`document.elementFromPoint`) — normally identical, but divergence (or
 * either one not being the expected button/row) is exactly the signal
 * needed to confirm or refute "the tap registered on the wrong element."
 *
 * Uses the SAME `[MobileDebugLog] ...` marker convention as every other
 * call site in this codebase — `installMobileDebugLogCapture`'s
 * `console.debug` monkey-patch (installed separately, in `app.tsx`)
 * already captures and forwards ANY marker-prefixed call regardless of
 * where it originates, so this function only needs to install the
 * listener and log; no changes to the capture/transport pipeline itself.
 *
 * Listens on `document` in the CAPTURE phase so it observes every event
 * before any handler downstream can stop its propagation, and `passive:
 * true` (never calls `preventDefault`/`stopPropagation`) so it can never
 * alter real event handling — this is instrumentation only, not a
 * behavior change.
 */
export function installPointerDebugLogCapture(): () => void {
  const logPointerEvent = (event: MouseEvent) => {
    const { clientX, clientY, type } = event;
    const target = event.target instanceof Element ? event.target : null;
    const elementAtPoint = document.elementFromPoint(clientX, clientY);

    console.debug(`${MARKER} pointer-event`, {
      type,
      timestampMs: Date.now(),
      clientX,
      clientY,
      targetTag: target?.tagName ?? null,
      targetId: target?.id || null,
      elementAtPointTag: elementAtPoint?.tagName ?? null,
      elementAtPointId: elementAtPoint?.id || null,
    });
  };

  const options: AddEventListenerOptions = { capture: true, passive: true };
  document.addEventListener('pointerdown', logPointerEvent, options);
  document.addEventListener('click', logPointerEvent, options);

  return () => {
    document.removeEventListener('pointerdown', logPointerEvent, options);
    document.removeEventListener('click', logPointerEvent, options);
  };
}
