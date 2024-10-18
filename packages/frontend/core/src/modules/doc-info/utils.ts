import { BlockStdScope } from '@blocksuite/affine/block-std';
import { PageEditorBlockSpecs } from '@blocksuite/affine/blocks';
import type { Doc } from '@blocksuite/affine/store';
import { useMemo } from 'react';
import { Observable } from 'rxjs';

interface ReadonlySignal<T> {
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

// todo(pengx17): use rc pool?
export function createBlockStdScope(doc: Doc) {
  const std = new BlockStdScope({
    doc,
    extensions: PageEditorBlockSpecs,
  });
  return std;
}

export function useBlockStdScope(doc: Doc) {
  return useMemo(() => createBlockStdScope(doc), [doc]);
}
