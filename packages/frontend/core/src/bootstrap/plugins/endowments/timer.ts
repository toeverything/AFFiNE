type Handler = (...args: any[]) => void;

export interface Timers {
  setTimeout: (handler: Handler, timeout?: number, ...args: any[]) => number;
  clearTimeout: (handle: number) => void;
  setInterval: (handler: Handler, timeout?: number, ...args: any[]) => number;
  clearInterval: (handle: number) => void;
  requestAnimationFrame: (callback: Handler) => number;
  cancelAnimationFrame: (handle: number) => void;
  requestIdleCallback?: typeof window.requestIdleCallback | undefined;
  cancelIdleCallback?: typeof window.cancelIdleCallback | undefined;
  queueMicrotask: typeof window.queueMicrotask;
}

export function createTimers(
  abortSignal: AbortSignal,
  originalTimes: Timers = {
    requestAnimationFrame,
    cancelAnimationFrame,
    requestIdleCallback:
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback
        : undefined,
    cancelIdleCallback:
      typeof cancelIdleCallback === 'function' ? cancelIdleCallback : undefined,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
  }
): Timers {
  const {
    requestAnimationFrame: _requestAnimationFrame,
    cancelAnimationFrame: _cancelAnimationFrame,
    setInterval: _setInterval,
    clearInterval: _clearInterval,
    setTimeout: _setTimeout,
    clearTimeout: _clearTimeout,
    cancelIdleCallback: _cancelIdleCallback,
    requestIdleCallback: _requestIdleCallback,
    queueMicrotask: _queueMicrotask,
  } = originalTimes;

  const interval_timer_id: number[] = [];
  const idle_id: number[] = [];
  const raf_id: number[] = [];

  abortSignal.addEventListener(
    'abort',
    () => {
      raf_id.forEach(_cancelAnimationFrame);
      interval_timer_id.forEach(_clearInterval);
      _cancelIdleCallback && idle_id.forEach(_cancelIdleCallback);
    },
    { once: true }
  );

  return {
    // id is a positive number, it never repeats.
    requestAnimationFrame(callback) {
      raf_id[raf_id.length] = _requestAnimationFrame(callback);
      return raf_id.length;
    },
    cancelAnimationFrame(handle) {
      const id = raf_id[handle - 1];
      if (!id) return;
      _cancelAnimationFrame(id);
    },
    setInterval(handler, timeout) {
      interval_timer_id[interval_timer_id.length] = (_setInterval as any)(
        handler,
        timeout
      );
      return interval_timer_id.length;
    },
    clearInterval(id) {
      if (!id) return;
      const handle = interval_timer_id[id - 1];
      if (!handle) return;
      _clearInterval(handle);
    },
    setTimeout(handler, timeout) {
      idle_id[idle_id.length] = (_setTimeout as any)(handler, timeout);
      return idle_id.length;
    },
    clearTimeout(id) {
      if (!id) return;
      const handle = idle_id[id - 1];
      if (!handle) return;
      _clearTimeout(handle);
    },
    requestIdleCallback: _requestIdleCallback
      ? function requestIdleCallback(callback, options) {
          idle_id[idle_id.length] = _requestIdleCallback(callback, options);
          return idle_id.length;
        }
      : undefined,
    cancelIdleCallback: _cancelIdleCallback
      ? function cancelIdleCallback(handle) {
          const id = idle_id[handle - 1];
          if (!id) return;
          _cancelIdleCallback(id);
        }
      : undefined,
    queueMicrotask(callback) {
      _queueMicrotask(() => abortSignal.aborted || callback());
    },
  };
}
