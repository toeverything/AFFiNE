import type { BlobSource, BlobState } from '@blocksuite/sync';
import { BehaviorSubject, ReplaySubject, share, throttleTime } from 'rxjs';

/**
 * @internal just for test
 *
 * API: /api/collection/:id/blob/:key
 * GET: get blob
 * PUT: set blob
 * DELETE: delete blob
 */
export class MockServerBlobSource implements BlobSource {
  private readonly _cache = new Map<string, Blob>();
  private readonly _states = new Map<string, BehaviorSubject<BlobState>>();

  readonly = false;

  constructor(readonly name: string) {}

  async delete(key: string) {
    this._cache.delete(key);
    this._states.delete(key);

    await fetch(`/api/collection/${this.name}/blob/${key}`, {
      method: 'DELETE',
    });
  }

  async get(key: string) {
    if (this._cache.has(key)) return this._cache.get(key)!;

    let state$ = this._states.get(key);
    if (!state$) {
      state$ = new BehaviorSubject<BlobState>(defaultState());

      this._states.set(key, state$);
    }

    let blob: Blob | null = null;

    nextState(state$, { downloading: true });

    try {
      const resp = await fetch(`/api/collection/${this.name}/blob/${key}`);

      if (!resp.ok) throw new Error(`Failed to fetch blob ${key}`);

      blob = await resp.blob();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      nextState(state$, { errorMessage });
    } finally {
      nextState(state$, { downloading: false });

      if (blob) {
        this._cache.set(key, blob);
      }
    }

    return blob;
  }

  async list() {
    return Array.from(this._cache.keys());
  }

  async set(key: string, value: Blob) {
    let state$ = this._states.get(key);
    if (!state$) {
      state$ = new BehaviorSubject<BlobState>(defaultState());

      this._states.set(key, state$);
    }

    this._cache.set(key, value);

    nextState(state$, { uploading: true });

    try {
      await fetch(`/api/collection/${this.name}/blob/${key}`, {
        method: 'PUT',
        body: value,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      nextState(state$, { errorMessage });
    } finally {
      nextState(state$, { uploading: false });
    }

    return key;
  }

  blobState$(key: string) {
    let state$ = this._states.get(key);

    if (!state$) {
      state$ = new BehaviorSubject<BlobState>(defaultState());

      this._states.set(key, state$);

      nextState(state$, { errorMessage: 'Blob not found' });
    }

    return state$.pipe(
      throttleTime(1000, undefined, { leading: true, trailing: true }),
      share({
        connector: () => new ReplaySubject(1),
      })
    );
  }
}

function defaultState(): BlobState {
  return {
    uploading: false,
    downloading: false,
    overSize: false,
    needDownload: false,
    needUpload: false,
  };
}

function nextState(
  state$: BehaviorSubject<BlobState>,
  state?: Partial<BlobState>
) {
  state$.next({ ...state$.value, ...state });
}
