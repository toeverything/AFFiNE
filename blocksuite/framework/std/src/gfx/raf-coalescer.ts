export interface RafCoalescer<T> {
  cancel: () => void;
  flush: () => void;
  schedule: (payload: T) => void;
}

type FrameScheduler = (callback: FrameRequestCallback) => number;
type FrameCanceller = (id: number) => void;

const getFrameScheduler = (): FrameScheduler => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame;
  }

  return callback => {
    return globalThis.setTimeout(() => {
      callback(
        typeof performance !== 'undefined' ? performance.now() : Date.now()
      );
    }, 16) as unknown as number;
  };
};

const getFrameCanceller = (): FrameCanceller => {
  if (typeof cancelAnimationFrame === 'function') {
    return cancelAnimationFrame;
  }

  return id => globalThis.clearTimeout(id);
};

/**
 * Coalesce high-frequency updates and only process the latest payload in one frame.
 */
export const createRafCoalescer = <T>(
  apply: (payload: T) => void
): RafCoalescer<T> => {
  const scheduleFrame = getFrameScheduler();
  const cancelFrame = getFrameCanceller();

  let pendingPayload: T | undefined;
  let hasPendingPayload = false;
  let rafId: number | null = null;

  const run = () => {
    rafId = null;
    if (!hasPendingPayload) return;

    const payload = pendingPayload as T;
    pendingPayload = undefined;
    hasPendingPayload = false;
    apply(payload);
  };

  return {
    schedule(payload: T) {
      pendingPayload = payload;
      hasPendingPayload = true;

      if (rafId !== null) return;
      rafId = scheduleFrame(run);
    },
    flush() {
      if (rafId !== null) cancelFrame(rafId);
      run();
    },
    cancel() {
      if (rafId !== null) {
        cancelFrame(rafId);
        rafId = null;
      }
      pendingPayload = undefined;
      hasPendingPayload = false;
    },
  };
};
