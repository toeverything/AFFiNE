import { computed, type ReadonlySignal } from '@preact/signals-core';

export const computedLock = <T>(
  value$: ReadonlySignal<T>,
  lock$: ReadonlySignal<boolean>
): ReadonlySignal<T> => {
  let previousValue: T;
  return computed(() => {
    if (lock$.value) {
      return previousValue ?? value$.value;
    }
    previousValue = value$.value;
    return previousValue;
  });
};
