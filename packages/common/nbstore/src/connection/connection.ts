import EventEmitter2 from 'eventemitter2';

import { MANUALLY_STOP } from '../utils/throw-if-aborted';

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'closed';

export interface Connection<T = any> {
  readonly status: ConnectionStatus;
  readonly error?: Error;
  readonly inner: T;
  connect(): void;
  disconnect(): void;
  waitForConnected(signal?: AbortSignal): Promise<void>;
  onStatusChanged(
    cb: (status: ConnectionStatus, error?: Error) => void
  ): () => void;
}

export abstract class AutoReconnectConnection<
  T = any,
> implements Connection<T> {
  private readonly event = new EventEmitter2({
    maxListeners: 100,
  });
  private _inner: T | undefined = undefined;
  private _status: ConnectionStatus = 'idle';
  private _error: Error | undefined = undefined;
  retryDelay = 3000;
  connectingTimeout = 15000;
  private refCount = 0;
  private connectingAbort?: AbortController;
  private reconnectingAbort?: AbortController;

  constructor() {}

  get shareId(): string | undefined {
    return undefined;
  }

  get maybeConnection() {
    return this._inner;
  }

  get inner(): T {
    if (this._inner === undefined) {
      throw new Error(
        `Connection ${this.constructor.name} has not been established.`
      );
    }

    return this._inner;
  }

  private set inner(inner: T | undefined) {
    this._inner = inner;
  }

  get status() {
    return this._status;
  }

  get error() {
    return this._error;
  }

  protected set error(error: Error | undefined) {
    this.handleError(error);
  }

  private setStatus(status: ConnectionStatus, error?: Error) {
    const shouldEmit = status !== this._status || error !== this._error;
    this._status = status;
    // we only clear-up error when status is connected
    if (error || status === 'connected') {
      this._error = error;
    }
    if (shouldEmit) {
      this.emitStatusChanged(status, this._error);
    }
  }

  protected abstract doConnect(signal?: AbortSignal): Promise<T>;
  protected abstract doDisconnect(conn: T): void;

  private innerConnect() {
    if (this.status !== 'connecting') {
      this.setStatus('connecting');
      const connectingAbort = new AbortController();
      this.connectingAbort = connectingAbort;
      const signal = connectingAbort.signal;
      const timeout = setTimeout(() => {
        if (!signal.aborted) {
          this.handleError(new Error('connecting timeout'));
        }
      }, this.connectingTimeout);
      this.doConnect(signal)
        .then(value => {
          clearTimeout(timeout);
          if (!signal.aborted) {
            this._inner = value;
            this.setStatus('connected');
          } else {
            try {
              this.doDisconnect(value);
            } catch (error) {
              console.error('failed to disconnect', error);
            }
          }
        })
        .catch(error => {
          if (!signal.aborted) {
            clearTimeout(timeout);
            console.error('failed to connect', error);
            this.handleError(error as any);
          }
        });
    }
  }

  private innerDisconnect() {
    this.connectingAbort?.abort(MANUALLY_STOP);
    this.reconnectingAbort?.abort(MANUALLY_STOP);
    try {
      if (this._inner) {
        this.doDisconnect(this._inner);
      }
    } catch (error) {
      console.error('failed to disconnect', error);
    }
    this.reconnectingAbort = undefined;
    this.connectingAbort = undefined;
    this._inner = undefined;
  }

  private handleError(reason?: Error) {
    // on error
    console.error('connection error, will reconnect', reason);
    this.innerDisconnect();
    // if the connection is closed, do not reconnect
    if (this.status === 'closed') {
      return;
    }
    this.setStatus('error', reason);
    // reconnect

    this.reconnectingAbort = new AbortController();
    const signal = this.reconnectingAbort.signal;
    const timeout = setTimeout(() => {
      if (!signal.aborted) {
        this.innerConnect();
      }
    }, this.retryDelay);
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
    });
  }

  connect() {
    this.refCount++;
    if (this.refCount === 1) {
      this.innerConnect();
    }
  }

  disconnect(force?: boolean) {
    if (force) {
      this.refCount = 0;
    } else {
      this.refCount = Math.max(this.refCount - 1, 0);
    }
    if (this.refCount === 0) {
      this.innerDisconnect();
      this.setStatus('closed');
    }
  }

  waitForConnected(signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (this.status === 'connected') {
        resolve();
        return;
      }

      const off = this.onStatusChanged(status => {
        if (status === 'connected') {
          resolve();
          off();
        }
      });

      signal?.addEventListener('abort', reason => {
        reject(reason);
        off();
      });
    });
  }

  onStatusChanged(
    cb: (status: ConnectionStatus, error?: Error) => void
  ): () => void {
    this.event.on('statusChanged', cb);
    return () => {
      this.event.off('statusChanged', cb);
    };
  }

  private readonly emitStatusChanged = (
    status: ConnectionStatus,
    error?: Error
  ) => {
    this.event.emit('statusChanged', status, error);
  };
}

export class DummyConnection implements Connection<undefined> {
  readonly status: ConnectionStatus = 'connected';
  readonly inner: undefined;

  connect(): void {
    return;
  }
  disconnect(): void {
    return;
  }
  waitForConnected(_signal?: AbortSignal): Promise<void> {
    return Promise.resolve();
  }
  onStatusChanged(
    _cb: (status: ConnectionStatus, error?: Error) => void
  ): () => void {
    return () => {};
  }
}
