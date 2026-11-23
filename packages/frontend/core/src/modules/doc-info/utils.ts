import { useEffect, useState } from 'react';
import { Observable } from 'rxjs';

interface ReadonlySignal<T> {
  value: T;
  subscribe: (fn: (value: T) => void) => () => void;
}

export function signalToObservable<T>(
  signal: ReadonlySignal<T>
): Observable<T> {
  return new Observable(subscriber => {
    const unsub = signal.subscribe(value => {
      subscriber.next(value);
    });
    return () => {
      unsub();
    };
  });
}
export function useSignalValue<T>(signal: ReadonlySignal<T>): T;
export function useSignalValue<T>(signal?: ReadonlySignal<T>): T | undefined;
export function useSignalValue<T>(signal?: ReadonlySignal<T>): T | undefined {
  const [value, setValue] = useState<T | undefined>(signal?.value);
  useEffect(() => {
    if (signal == null) {
      return;
    }
    return signal.subscribe(value => {
      setValue(value);
    });
  }, [signal]);
  return value;
}
