import type { Disposable } from '@blocksuite/global/disposable';
import type { BlobEngine, BlobState } from '@blocksuite/sync';
import {
  computed,
  effect,
  type ReadonlySignal,
  signal,
} from '@preact/signals-core';
import type { TemplateResult } from 'lit-html';

export type ResourceKind = 'Blob' | 'File' | 'Image';

export type StateKind =
  | 'loading'
  | 'uploading'
  | 'error'
  | 'error:oversize'
  | 'none';

export type StateInfo = {
  icon: TemplateResult;
  title?: string;
  description?: string | null;
};

export type ResolvedStateInfoPart = {
  loading: boolean;
  error: boolean;
  state: StateKind;
  url: string | null;
  needUpload: boolean;
};

export type ResolvedStateInfo = StateInfo & ResolvedStateInfoPart;

export class ResourceController implements Disposable {
  readonly blobUrl$ = signal<string | null>(null);

  // TODO(@fundon): default `loading` status.
  readonly state$ = signal<Partial<BlobState>>({});

  readonly resolvedState$ = computed<ResolvedStateInfoPart>(() => {
    const url = this.blobUrl$.value;
    const {
      needUpload = false,
      uploading = false,
      downloading = false,
      overSize = false,
      errorMessage,
    } = this.state$.value;
    const hasExceeded = overSize;
    const hasError = hasExceeded || Boolean(errorMessage);
    const state = this.determineState(
      hasExceeded,
      hasError,
      uploading,
      downloading
    );

    const loading = state === 'uploading' || state === 'loading';

    return {
      error: hasError,
      needUpload,
      loading,
      state,
      url,
    };
  });

  private engine?: BlobEngine;

  constructor(
    readonly blobId$: ReadonlySignal<string | undefined>,
    readonly kind: ResourceKind = 'File'
  ) {}

  // This is a tradeoff, initializing `Blob Sync Engine`.
  setEngine(engine: BlobEngine) {
    this.engine = engine;
    return this;
  }

  determineState(
    hasExceeded: boolean,
    hasError: boolean,
    uploading: boolean,
    downloading: boolean
  ): StateKind {
    if (hasExceeded) return 'error:oversize';
    if (hasError) return 'error';
    if (uploading) return 'uploading';
    if (downloading) return 'loading';
    return 'none';
  }

  resolveStateWith(
    info: {
      loadingIcon: TemplateResult;
      errorIcon?: TemplateResult;
    } & StateInfo
  ): ResolvedStateInfo {
    const { error, loading, state, url, needUpload } =
      this.resolvedState$.value;

    const { icon, title, description, loadingIcon, errorIcon } = info;

    const result = {
      error,
      loading,
      state,
      icon,
      title,
      description,
      url,
      needUpload,
    };

    if (loading) {
      result.icon = loadingIcon ?? icon;
    } else if (error) {
      result.icon = errorIcon ?? icon;
      result.description = this.state$.value.errorMessage ?? description;
    }

    return result;
  }

  updateState(state: Partial<BlobState>) {
    this.state$.value = { ...this.state$.value, ...state };
  }

  subscribe() {
    return effect(() => {
      const blobId = this.blobId$.value;
      if (!blobId) return;

      const blobState$ = this.engine?.blobState$(blobId);
      if (!blobState$) return;

      const subscription = blobState$.subscribe(state => {
        let { uploading, downloading, errorMessage } = state;
        if (state.overSize) {
          uploading = false;
          downloading = false;
        } else if ((uploading || downloading) && errorMessage) {
          errorMessage = null;
        }

        this.updateState({ ...state, uploading, downloading, errorMessage });
      });

      return () => subscription.unsubscribe();
    });
  }

  async blob() {
    const blobId = this.blobId$.peek();
    if (!blobId) return null;

    let blob: Blob | null = null;
    let errorMessage: string | null = null;

    try {
      if (!this.engine) {
        throw new Error('Blob engine is not initialized');
      }

      blob = (await this.engine.get(blobId)) ?? null;

      if (!blob) errorMessage = `${this.kind} not found`;
    } catch (err) {
      console.error(err);
      errorMessage = `Failed to retrieve ${this.kind}`;
    }

    if (errorMessage) this.updateState({ errorMessage });

    return blob;
  }

  async createUrlWith(type?: string) {
    let blob = await this.blob();
    if (!blob) return null;

    if (type) blob = new Blob([blob], { type });

    return URL.createObjectURL(blob);
  }

  async refreshUrlWith(type?: string) {
    // Resets the state.
    this.state$.value = {};

    const url = await this.createUrlWith(type);
    if (!url) return;

    const prevUrl = this.blobUrl$.peek();

    this.blobUrl$.value = url;

    if (!prevUrl) return;

    // Releases the previous url.
    URL.revokeObjectURL(prevUrl);
  }

  // Re-upload to the server.
  async upload() {
    const blobId = this.blobId$.peek();
    if (!blobId) return;

    const state = this.state$.peek();
    if (!state.needUpload) return;
    if (state.uploading) return;

    // Resets the state.
    this.state$.value = {};

    return await this.engine?.upload(blobId);
  }

  dispose() {
    const url = this.blobUrl$.peek();
    if (!url) return;

    // Releases the current url.
    URL.revokeObjectURL(url);
  }
}
