import { Signal } from '@preact/signals-core';

export function resolveSignal<T>(data: T | Signal<T>): T {
  return data instanceof Signal ? data.value : data;
}
