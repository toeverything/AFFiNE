import * as Y from 'yjs';

import type { ProxyOptions } from './types';

export abstract class BaseReactiveYData<
  T,
  YSource extends Y.AbstractType<any>,
> {
  /**
   * `createYProxy` (`proxy.ts`) caches one `BaseReactiveYData` instance per
   * underlying Y structure (`proxies` WeakMap, `memory.ts`) — the first
   * caller to wrap a given array/map "wins" and gets its `onChange` baked
   * into `_options` at construction; every *other* caller wrapping the
   * *same* Y structure (e.g. a second, independent `SyncController`/model
   * for the same block — exactly what happens when a block is rendered
   * through 2+ simultaneous `Store` views, as with a table appearing more
   * than once on a page) got back the same proxy object but had its own
   * `onChange` silently discarded. In-place mutations on that structure
   * (`.splice()`, `.push()`, etc. — as `addProperty` uses to add a new
   * database column) would then only ever notify the very first
   * `SyncController` that happened to touch it; every other one's signal
   * for that prop stayed stale until some *unrelated* wholesale
   * reassignment of the same top-level prop (a different, correctly-
   * broadcasting code path) happened to drag it along. This registry lets
   * `createYProxy`'s cache-hit path add each additional caller's listener
   * instead of dropping it.
   */
  private readonly _extraChangeListeners = new Set<
    (data: T, isLocal: boolean) => void
  >();

  addChangeListener(onChange?: (data: T, isLocal: boolean) => void) {
    // If this is literally the same callback already baked in as the
    // baseline `_options.onChange` (the same `SyncController` calling
    // `createYProxy` again for a Y structure it already wraps — see the
    // comment on `_getPropsProxy` in `sync-controller.ts` for why that
    // legitimately happens), adding it again here would double-fire it.
    if (onChange && onChange !== this._options?.onChange) {
      this._extraChangeListeners.add(onChange);
    }
  }

  protected _getOrigin = (
    doc: Y.Doc
  ): {
    doc: Y.Doc;
    proxy: true;

    target: BaseReactiveYData<any, any>;
  } => {
    return {
      doc,
      proxy: true,
      target: this,
    };
  };

  protected _onObserve = (event: Y.YEvent<any>, handler: () => void) => {
    if (
      event.transaction.origin?.force === true ||
      (event.transaction.origin?.proxy !== true &&
        (!event.transaction.local ||
          event.transaction.origin instanceof Y.UndoManager))
    ) {
      handler();
    }

    const isLocal =
      !event.transaction.origin ||
      !this._ySource.doc ||
      event.transaction.origin instanceof Y.UndoManager ||
      event.transaction.origin.proxy
        ? true
        : event.transaction.origin === this._ySource.doc.clientID;

    this._options?.onChange?.(this._proxy, isLocal);
    this._extraChangeListeners.forEach(listener => {
      listener(this._proxy, isLocal);
    });
  };

  protected abstract readonly _options?: ProxyOptions<T>;

  protected abstract readonly _proxy: T;

  protected _skipNext = false;

  protected abstract readonly _source: T;

  protected readonly _stashed = new Set<string | number>();

  protected _transact = (doc: Y.Doc, fn: () => void) => {
    doc.transact(fn, this._getOrigin(doc));
  };

  protected _updateWithSkip = (fn: () => void) => {
    if (this._skipNext) {
      return;
    }
    this._skipNext = true;
    fn();
    this._skipNext = false;
  };

  protected abstract readonly _ySource: YSource;

  get proxy() {
    return this._proxy;
  }

  abstract pop(prop: string | number): void;
  abstract stash(prop: string | number): void;
}
