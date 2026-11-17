import type { Store } from '@blocksuite/store';

/**
 * Kicks off loading a cross-doc reference target if it hasn't started yet.
 * `doc.ready` flips synchronously on `load()`, but the doc's actual Yjs
 * content still streams in asynchronously afterward (from local storage, or
 * a remote peer) — this only starts that process, it doesn't wait for it.
 */
export function ensureDocLoaded(doc: Store['doc']): void {
  if (!doc.ready) doc.load();
}

/**
 * Resolves once `blockId` appears in `doc` (kicking off `ensureDocLoaded`
 * first), or `false` if it hasn't appeared within `timeoutMs`. Debounces
 * re-checks against the doc's own Yjs `update` event, since a doc still
 * streaming in from local storage can emit many updates in quick
 * succession and each check re-queries the store.
 */
export function waitForBlockInDoc(
  doc: Store['doc'],
  blockId: string,
  { timeoutMs = 10_000, debounceMs = 300 } = {}
): Promise<boolean> {
  ensureDocLoaded(doc);
  const store = doc.getStore({ id: doc.id });
  if (store.getBlock(blockId)) return Promise.resolve(true);

  return new Promise(resolve => {
    let settled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      settled = true;
      if (debounce) clearTimeout(debounce);
      clearTimeout(timeout);
      doc.spaceDoc.off('update', onUpdate);
    };

    const check = () => {
      if (settled) return;
      if (store.getBlock(blockId)) {
        cleanup();
        resolve(true);
      }
    };

    const onUpdate = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(check, debounceMs);
    };

    doc.spaceDoc.on('update', onUpdate);
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
  });
}

/**
 * Resolves once `doc`'s content has quieted down (no `update` events for
 * `debounceMs`), or `timeoutMs` elapses — for callers that need to scan a
 * doc for *any* qualifying block rather than waiting on one known id (so
 * `waitForBlockInDoc` doesn't apply). Bounded, not a guarantee the doc is
 * fully synced — just materially better than checking immediately after
 * `ensureDocLoaded`, which can run against a still-empty store.
 */
export function waitForDocSettled(
  doc: Store['doc'],
  { timeoutMs = 10_000, debounceMs = 500 } = {}
): Promise<void> {
  ensureDocLoaded(doc);

  return new Promise(resolve => {
    let settled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (debounce) clearTimeout(debounce);
      clearTimeout(timeout);
      doc.spaceDoc.off('update', onUpdate);
      resolve();
    };

    const onUpdate = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(finish, debounceMs);
    };

    doc.spaceDoc.on('update', onUpdate);
    // Also arms immediately, in case the doc was already fully loaded and
    // never emits another `update` at all.
    debounce = setTimeout(finish, debounceMs);
    const timeout = setTimeout(finish, timeoutMs);
  });
}
