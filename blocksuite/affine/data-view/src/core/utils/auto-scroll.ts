import { effect, type ReadonlySignal } from '@preact/signals-core';

const timeWeight = 1 / 16;
const distanceWeight = 1 / 8;

export const autoScrollOnBoundary = (
  container: HTMLElement,
  box: ReadonlySignal<{
    left: number;
    right: number;
    top: number;
    bottom: number;
  }>,
  ops?: {
    onScroll?: () => void;
  }
) => {
  let updateTask = 0;
  const startUpdate = () => {
    if (updateTask) {
      return;
    }
    const update = (preTime: number) => {
      const now = Date.now();
      const delta = now - preTime;
      updateTask = 0;
      const { left, right, top, bottom } = box.value;
      const rect = container.getBoundingClientRect();
      const getResult = (diff: number) =>
        (diff * distanceWeight + 1) * delta * timeWeight;
      let move = false;
      if (left < rect.left) {
        const diff = getResult(rect.left - left);
        container.scrollLeft -= diff;
        if (diff !== 0) {
          move = true;
        }
      }
      if (right > rect.right) {
        const diff = getResult(right - rect.right);
        container.scrollLeft += diff;
        if (diff !== 0) {
          move = true;
        }
      }
      if (top < rect.top) {
        const diff = getResult(rect.top - top);
        container.scrollTop -= diff;
        if (diff !== 0) {
          move = true;
        }
      }
      if (bottom > rect.bottom) {
        const diff = getResult(bottom - rect.bottom);
        container.scrollTop += diff;
        if (diff !== 0) {
          move = true;
        }
      }
      if (move) {
        ops?.onScroll?.();
        updateTask = requestAnimationFrame(() => update(now));
      }
    };
    const now = Date.now();
    updateTask = requestAnimationFrame(() => update(now));
  };

  const cancelBoxListen = effect(() => {
    box.value;
    startUpdate();
  });

  return () => {
    cancelBoxListen();
    cancelAnimationFrame(updateTask);
  };
};
