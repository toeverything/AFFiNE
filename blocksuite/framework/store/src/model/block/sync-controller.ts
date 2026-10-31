import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { effect, signal } from '@preact/signals-core';
import { equalityDeep } from 'lib0/function.js';
import { createMutex } from 'lib0/mutex.js';
import * as Y from 'yjs';

import {
  Boxed,
  createYProxy,
  native2Y,
  type UnRecord,
  y2Native,
} from '../../reactive/index.js';
import type { Schema } from '../../schema/schema.js';
import type { Store } from '../store/store.js';
import { BlockModel } from './block-model.js';
import type { YBlock } from './types.js';
import { internalPrimitives } from './zod.js';

/**
 * Every `SyncController` constructed for the same underlying `yBlock` (e.g.
 * one per reference, once a block is rendered through 2+ simultaneous
 * `Store`s) registers itself here. This is what lets a change observed by
 * *any one* of them reach *all* of their own, separate `props.<name>$`
 * signals — without it, a change nested more than one level deep inside an
 * object/array-valued prop (e.g. `cells[rowId][columnId] = ...`, as Kanban's
 * own drag-and-drop uses) only ever reached whichever `SyncController`
 * happened to construct that specific nested Y-structure's reactive wrapper
 * first (see `reactive/proxy.ts`'s `addChangeListener` fix for the
 * *top-level* cache-hit case — that fix does not recursively propagate a
 * newly-added listener down into already-existing nested wrappers, since
 * there is no general mechanism for it to do so). Confirmed live: a Kanban
 * card's group-by cell write landed correctly in Yjs and updated one
 * `SyncController`'s own `cells$` signal, but a second `SyncController` for
 * the exact same block (a different reference to the same table) never saw
 * it — its own `cells$.value` stayed on the pre-drag content forever,
 * because its own listener was only ever registered on the outer `cells`
 * wrapper, not on the already-existing, already-owned-by-the-first-
 * `SyncController` row-level sub-map beneath it.
 */
const syncControllersByYBlock = new WeakMap<YBlock, Set<SyncController>>();

/**
 * @internal
 * SyncController is responsible for syncing the block data with Yjs.
 * It creates a proxy model that syncs with Yjs and provides a reactive interface.
 * It also handles the stashing and popping of props.
 * It will also provide signals for block props.
 *
 */
export class SyncController {
  private _byPassProxy: boolean = false;

  private readonly _byPassUpdate = (fn: () => void) => {
    this._byPassProxy = true;
    fn();
    this._byPassProxy = false;
  };

  private readonly _mutex = createMutex();

  private readonly _observeYBlockChanges = () => {
    this.yBlock.observe(event => {
      event.keysChanged.forEach(key => {
        const type = event.changes.keys.get(key);
        if (!type) {
          return;
        }
        const isLocal =
          !this.yBlock.doc ||
          !event.transaction.origin ||
          event.transaction.origin instanceof Y.UndoManager ||
          event.transaction.origin.proxy
            ? true
            : event.transaction.origin === this.yBlock.doc.clientID;
        if (type.action === 'update' || type.action === 'add') {
          const value = this.yBlock.get(key);
          const keyName = key.replace('prop:', '');
          const proxy = this._getPropsProxy(keyName, value);
          this._byPassUpdate(() => {
            // @ts-expect-error allow magic props
            this.model.props[keyName] = proxy;
          });
          this._syncSiblingSignals(keyName, y2Native(value));
          this.onChange?.(keyName, isLocal);
          return;
        }
        if (type.action === 'delete') {
          const keyName = key.replace('prop:', '');
          this._byPassUpdate(() => {
            // @ts-expect-error allow magic props
            delete this.model.props[keyName];
            if (`${keyName}$` in this.model.props) {
              // @ts-expect-error allow magic props
              this.model.props[`${keyName}$`].value = undefined;
            }
          });
          this.onChange?.(keyName, isLocal);
          return;
        }
      });
    });
  };

  private readonly _stashed = new Set<string | number>();

  readonly flavour: string;

  readonly id: string;

  readonly model: BlockModel;

  readonly pop = (prop: string) => {
    if (!this._stashed.has(prop)) return;
    this._popProp(prop);
  };

  readonly stash = (prop: string) => {
    if (this._stashed.has(prop)) return;

    this._stashed.add(prop);
    this._stashProp(prop);
  };

  readonly version: number;

  readonly yChildren: Y.Array<string[]>;

  constructor(
    readonly schema: Schema,
    readonly yBlock: YBlock,
    readonly doc?: Store,
    readonly onChange?: (key: string, isLocal: boolean) => void
  ) {
    const { id, flavour, version, yChildren, props } = this._parseYBlock();

    this.id = id;
    this.flavour = flavour;
    this.yChildren = yChildren;
    this.version = version;

    this.model = this._createModel(props);
    this._registerForSiblingSync();

    this._observeYBlockChanges();
  }

  /**
   * Registers `this` alongside every other `SyncController` already
   * wrapping the same `yBlock`, and unregisters on model deletion. See the
   * module-level `syncControllersByYBlock` doc comment for why this exists.
   */
  private _registerForSiblingSync() {
    let siblings = syncControllersByYBlock.get(this.yBlock);
    if (!siblings) {
      siblings = new Set();
      syncControllersByYBlock.set(this.yBlock, siblings);
    }
    siblings.add(this);
    const subscription = this.model.deleted.subscribe(() => {
      subscription.unsubscribe();
      siblings?.delete(this);
    });
  }

  /**
   * Pushes `fresh` (an already-`y2Native`-converted value) into the
   * `${keyName}$` signal of *every* `SyncController` registered for this
   * same `yBlock` (including `this`) — not just whichever one happened to
   * observe the underlying change. Each sibling's own `_mutex` still guards
   * that specific sibling's own reentrant write-back effect (see
   * `_createModel`), so this is safe to call unconditionally regardless of
   * how many siblings exist.
   */
  private _syncSiblingSignals(keyName: string, fresh: unknown) {
    const signalKey = `${keyName}$`;
    const siblings = syncControllersByYBlock.get(this.yBlock);
    siblings?.forEach(sibling => {
      if (signalKey in sibling.model.props) {
        // Deferred to the next microtask rather than written synchronously
        // here. This observer callback runs *inside* the very Yjs
        // transaction/observer chain that a `SyncController`'s own
        // `_createModel` `effect()` triggers when it writes `data.value`
        // (this exact `${keyName}$` signal) into `model.props[key]` ->
        // Yjs — for the *originating* `SyncController` (always included
        // in `siblings`, see the constructor), writing back into that
        // same signal here is still inside that same effect's own
        // synchronous callback, which Preact Signals' own cycle detection
        // correctly refuses (confirmed live: a "Cycle detected" throw,
        // initiating an inline LaTeX equation).
        //
        // A first attempt compared values with `equalityDeep` and skipped
        // only when unchanged, on the theory this was a redundant-write
        // problem — it wasn't: the throw still happened on an actual,
        // intentional value change, because Preact's cycle detection
        // cares about still being inside this signal's own notification,
        // not about whether the value differs. A second attempt skipped
        // the originating sibling unconditionally instead — also wrong:
        // that signal genuinely does need to reflect the confirmed value
        // (this method exists precisely to propagate a Yjs-observed
        // change, whichever origin, into *every* sibling's signal — see
        // this class's own header comment), so skipping it left any
        // `SignalWatcher`-based UI reading it directly stuck on stale
        // data indefinitely (confirmed live: inline equations stopped
        // updating anywhere on a page with a nested reference present,
        // not just inside the reference).
        //
        // Deferring the write to the next microtask — after the current
        // synchronous notification has fully unwound — keeps the update
        // for every sibling, including the originating one, while still
        // avoiding the same-tick reentrancy Preact objects to.
        queueMicrotask(() => {
          sibling._mutex(() => {
            // @ts-expect-error allow magic props
            sibling.model.props[signalKey].value = fresh;
          });
        });
      }
    });
  }

  private _createModel(props: UnRecord) {
    const _mutex = this._mutex;
    const schema = this.schema.flavourSchemaMap.get(this.flavour);
    if (!schema) {
      throw new BlockSuiteError(
        ErrorCode.ModelCRUDError,
        `schema for flavour: ${this.flavour} not found`
      );
    }

    const model = schema.model.toModel?.() ?? new BlockModel<object>();
    model.schema = schema;
    const signalWithProps = Object.entries(props).reduce(
      (acc, [key, value]) => {
        const data = signal(value);
        const dispose = effect(() => {
          const value = data.value;
          if (!this.model) return;
          _mutex(() => {
            // @ts-expect-error allow magic props
            this.model.props[key] = value;
          });
        });
        const subscription = model.deleted.subscribe(() => {
          subscription.unsubscribe();
          dispose();
        });
        return {
          ...acc,
          [`${key}$`]: data,
          [key]: value,
        };
      },
      {} as Record<string, unknown>
    );

    model.id = this.id;
    model.keys = Object.keys(props);
    model.yBlock = this.yBlock;
    model.stash = this.stash;
    model.pop = this.pop;
    if (this.doc) {
      model.store = this.doc;
    }

    const proxy = new Proxy(signalWithProps, {
      has: (target, p) => {
        return Reflect.has(target, p);
      },
      set: (target, p, value, receiver) => {
        if (
          !this._byPassProxy &&
          typeof p === 'string' &&
          model.keys.includes(p)
        ) {
          if (this._stashed.has(p)) {
            setValue(target, p, value);
            const result = Reflect.set(target, p, value, receiver);
            this.onChange?.(p, true);
            return result;
          }

          // `native2Y` always mints a brand-new Y structure for object/array
          // values (never reuses an existing one, even for identical
          // content), so the reference-equality check just below can never
          // short-circuit a genuinely no-op write for such props — only for
          // primitives, which `native2Y` returns unchanged. Round-tripping
          // through Yjs is exactly as lossy in the other direction: whenever
          // this block's own Yjs observer sees *any* 'update'/'add' event for
          // a key, it unconditionally re-deserializes via `y2Native` (also
          // always a fresh object) and assigns it to this prop's signal —
          // regardless of whether the content actually changed — which is
          // what routes back into this very setter via this class's own
          // write-back `effect()` (see `_createModel`). With a single
          // `SyncController` for a block, `_mutex`/`_byPassProxy` guard
          // against that effect's write cascading into itself. But every
          // additional `SyncController` wrapping the *same* underlying
          // block (e.g. the same table rendered through more than one
          // reference at once — each gets its own full `Block`/model/effect
          // graph, see `block.ts`) reacts to the others' writes with no
          // such protection between them: A's redundant write triggers B's
          // own redundant write-back, which triggers A's again, forever —
          // a real, reproduced infinite loop that tripped signals' hard
          // "Cycle detected" re-entrancy guard after 100+ synchronous
          // re-entrant writes, confirmed by an actual live capture showing
          // byte-identical `views` content across dozens of consecutive
          // writes. A value-based check stops these known-no-op writes
          // before they ever reach Yjs, for however many independent
          // `SyncController`s exist.
          //
          // Compared against the *actual current Yjs value* (re-deserialized
          // via `y2Native`), not `target[p]` — `target[p]` is deliberately
          // out of sync with Yjs while a prop is stashed (see `stash`/`pop`
          // below: stashed writes update `target[p]` only, precisely so
          // `pop` can later flush the accumulated value through for the
          // first time), so comparing against it would wrongly treat that
          // flush as a no-op and silently drop it.
          if (equalityDeep(y2Native(this.yBlock.get(`prop:${p}`)), value)) {
            return Reflect.set(target, p, value, receiver);
          }

          const yValue = native2Y(value);
          if (this.yBlock.get(`prop:${p}`) === yValue) {
            return Reflect.set(target, p, value, receiver);
          }
          this.yBlock.set(`prop:${p}`, yValue);
          const proxy = this._getPropsProxy(p, yValue);
          // `y2Native(this.yBlock.get(...))`, not the raw `value` argument
          // — `value` is whatever native object the *caller* passed in,
          // which can contain not-yet-integrated nested Y-types (e.g. a
          // bare `new Text('foo')` never attached to any doc, embedded
          // inside a plain object/array prop written via a single
          // top-level reassignment, the standard pattern for e.g.
          // `cells[rowId][columnId] = { value: new Text(...) }`). Passing
          // that straight into the `${p}$` signal means the signal
          // forever reflects that pre-integration snapshot — a nested
          // `Text` with no backing `Item`, so `.toString()` returns ''
          // permanently, even though `target[p]` (set two lines below,
          // from `proxy`/`yValue`) and every later Yjs-observer-driven
          // update (`_syncSiblingSignals`/`_getPropsProxy`'s `onChange`,
          // both of which already re-derive via `y2Native(this.yBlock.get
          // (...))`, never the raw value) correctly resolve it. Confirmed
          // live: `DatabaseBlockDataSource`'s task-parent-identity `Text`
          // cells read back with empty content through `cells$` (the
          // signal) immediately after being written, while the plain,
          // non-signal `cells` prop on the same object had the real
          // content — silently breaking every parent/ancestor status
          // computation that depends on reading a just-written identity
          // cell in the same synchronous pass. Re-reading from `this.
          // yBlock` here (already just set, two lines up) instead of
          // reusing `value` matches the same already-established pattern
          // this file uses everywhere else a signal needs a definitely-
          // integrated value.
          setValue(target, p, y2Native(this.yBlock.get(`prop:${p}`)));
          return Reflect.set(target, p, proxy, receiver);
        }

        return Reflect.set(target, p, value, receiver);
      },
      get: (target, p, receiver) => {
        return Reflect.get(target, p, receiver);
      },
      deleteProperty: (target, p) => {
        if (
          !this._byPassProxy &&
          typeof p === 'string' &&
          model.keys.includes(p)
        ) {
          this.yBlock.delete(`prop:${p}`);
          setValue(target, p, undefined);
        }

        return Reflect.deleteProperty(target, p);
      },
    });
    model._props = proxy;

    function setValue(target: UnRecord, p: string, value: unknown) {
      _mutex(() => {
        // @ts-expect-error allow magic props
        target[`${p}$`].value = value;
      });
    }
    return model;
  }

  // `createYProxy` caches one reactive wrapper per underlying Y structure
  // and registers *additional* listeners for later callers wrapping the
  // same structure (see `addChangeListener` — needed so a second
  // independent `SyncController` sharing this block gets notified of
  // in-place mutations too). But `_getPropsProxy` itself can legitimately
  // be called more than once *for this same `SyncController`* against the
  // very same Y structure — e.g. the top-level proxy `set` trap below
  // calls it directly right after `this.yBlock.set(...)`, which
  // synchronously triggers `_observeYBlockChanges`'s handler, which also
  // calls it. Without memoizing the handler per prop name, each call would
  // mint a distinct closure, and this SyncController's own listener would
  // get registered twice — double-firing `onChange`/the prop signal for
  // every local write. Reading the current Y value fresh (rather than
  // closing over the `value` parameter, which is only ever correct until
  // the next wholesale reassignment of this prop) keeps the memoized
  // handler correct across the only case where the underlying object
  // actually changes identity.
  private readonly _propsProxyOnChange = new Map<
    string,
    (data: unknown, isLocal: boolean) => void
  >();

  private _getPropsProxy(name: string, value: unknown) {
    let onChange = this._propsProxyOnChange.get(name);
    if (!onChange) {
      onChange = (_data: unknown, isLocal: boolean) => {
        this.onChange?.(name, isLocal);
        this._syncSiblingSignals(
          name,
          y2Native(this.yBlock.get(`prop:${name}`))
        );
      };
      this._propsProxyOnChange.set(name, onChange);
    }
    return createYProxy(value, { onChange });
  }

  private _parseYBlock() {
    let id: string | undefined;
    let flavour: string | undefined;
    let version: number | undefined;
    let yChildren: Y.Array<string[]> | undefined;
    const props: Record<string, unknown> = {};

    this.yBlock.forEach((value, key) => {
      if (key.startsWith('prop:')) {
        const keyName = key.replace('prop:', '');
        props[keyName] = this._getPropsProxy(keyName, value);
        return;
      }
      if (key === 'sys:id' && typeof value === 'string') {
        id = value;
        return;
      }
      if (key === 'sys:flavour' && typeof value === 'string') {
        flavour = value;
        return;
      }
      if (key === 'sys:children' && value instanceof Y.Array) {
        yChildren = value;
        return;
      }
      if (key === 'sys:version' && typeof value === 'number') {
        version = value;
        return;
      }
    });

    if (!id) {
      throw new BlockSuiteError(
        ErrorCode.ModelCRUDError,
        'block id is not found when creating model'
      );
    }
    if (!flavour) {
      throw new BlockSuiteError(
        ErrorCode.ModelCRUDError,
        'block flavour is not found when creating model'
      );
    }
    if (!yChildren) {
      throw new BlockSuiteError(
        ErrorCode.ModelCRUDError,
        'block children is not found when creating model'
      );
    }

    const schema = this.schema.flavourSchemaMap.get(flavour);
    if (!schema) {
      throw new BlockSuiteError(
        ErrorCode.ModelCRUDError,
        `schema for flavour: ${flavour} not found`
      );
    }
    const defaultProps = schema.model.props?.(internalPrimitives);

    if (typeof version !== 'number') {
      // no version found in data, set to schema version
      version = schema.version;
    }

    // Set default props if not exists
    if (defaultProps) {
      Object.entries(defaultProps).forEach(([key, value]) => {
        if (key in props) return;

        const yValue = native2Y(value);
        if (value !== undefined) {
          this.yBlock.set(`prop:${key}`, yValue);
        }
        props[key] = this._getPropsProxy(key, yValue);
      });
    }

    return {
      id,
      flavour,
      version,
      props,
      yChildren,
    };
  }

  private _popProp(prop: string) {
    const model = this.model as BlockModel<Record<string, unknown>>;

    const value = model.props[prop];
    this._stashed.delete(prop);
    model.props[prop] = value;
  }

  private _stashProp(prop: string) {
    (this.model as BlockModel<Record<string, unknown>>).props[prop] = y2Native(
      this.yBlock.get(`prop:${prop}`),
      {
        transform: (value, origin) => {
          if (Boxed.is(origin)) {
            return value;
          }
          if (origin instanceof Y.Map) {
            return new Proxy(value as UnRecord, {
              get: (target, p, receiver) => {
                return Reflect.get(target, p, receiver);
              },
              set: (target, p, value, receiver) => {
                const result = Reflect.set(target, p, value, receiver);
                this.onChange?.(prop, true);
                return result;
              },
              deleteProperty: (target, p) => {
                const result = Reflect.deleteProperty(target, p);
                this.onChange?.(prop, true);
                return result;
              },
            });
          }
          if (origin instanceof Y.Array) {
            return new Proxy(value as unknown[], {
              get: (target, p, receiver) => {
                return Reflect.get(target, p, receiver);
              },
              set: (target, p, value, receiver) => {
                const index = Number(p);
                if (Number.isNaN(index)) {
                  return Reflect.set(target, p, value, receiver);
                }
                const result = Reflect.set(target, p, value, receiver);
                this.onChange?.(prop, true);
                return result;
              },
              deleteProperty: (target, p) => {
                const result = Reflect.deleteProperty(target, p);
                this.onChange?.(p as string, true);
                return result;
              },
            });
          }

          return value;
        },
      }
    );
  }
}
