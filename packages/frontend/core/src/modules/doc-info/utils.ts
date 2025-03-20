import { DebugLogger } from '@affine/debug';
import { BlockStdScope } from '@blocksuite/affine/block-std';
import { PageEditorBlockSpecs } from '@blocksuite/affine/extensions';
import type { Store } from '@blocksuite/affine/store';
import { useEffect, useMemo, useState } from 'react';
import { Observable } from 'rxjs';

const logger = new DebugLogger('doc-info');

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

// todo(pengx17): use rc pool?
export function createBlockStdScope(doc: Store) {
  logger.debug('createBlockStdScope', doc.id);
  const std = new BlockStdScope({
    store: doc,
    extensions: PageEditorBlockSpecs,
  });
  return std;
}

export function useBlockStdScope(doc: Store) {
  return useMemo(() => createBlockStdScope(doc), [doc]);
}
