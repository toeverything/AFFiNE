export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    let resolved = false;
    signal?.addEventListener('abort', () => {
      if (!resolved) {
        clearTimeout(timeId);
        resolve();
      }
    });

    const timeId = setTimeout(() => {
      resolved = true;
      resolve();
    }, ms);
  });
}

export function noop(_?: unknown) {
  return;
}

export async function nextTick() {
  if ('scheduler' in window && 'yield' in window.scheduler) {
    return window.scheduler.yield();
  } else if (typeof requestIdleCallback !== 'undefined') {
    return new Promise(resolve => requestIdleCallback(resolve));
  } else {
    return new Promise(resolve => setTimeout(resolve, 0));
  }
}
