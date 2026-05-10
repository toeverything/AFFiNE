import type { RealtimeSubscriptionReady } from '@affine/realtime';
import type { Observable, Subscription } from 'rxjs';

export type RealtimeLiveQueryEventResult = 'applied' | 'revalidate';

export type RealtimeLiveQueryOptions<TSnapshot, TEvent extends object> = {
  request: (signal: AbortSignal) => Promise<TSnapshot>;
  subscribe: () => Observable<TEvent | RealtimeSubscriptionReady>;
  applySnapshot: (snapshot: TSnapshot) => void;
  applyEvent?: (event: TEvent) => RealtimeLiveQueryEventResult;
  onError?: (error: unknown) => void;
};

function isReadyEvent<TEvent extends object>(
  event: TEvent | RealtimeSubscriptionReady
): event is RealtimeSubscriptionReady {
  return 'type' in event && event.type === 'ready';
}

export class RealtimeLiveQuery<TSnapshot, TEvent extends object> {
  private subscription?: Subscription;
  private requestController?: AbortController;
  private generation = 0;
  private started = false;

  constructor(
    private readonly options: RealtimeLiveQueryOptions<TSnapshot, TEvent>
  ) {}

  start() {
    this.stop();
    this.started = true;
    const generation = this.generation;
    this.subscription = this.options.subscribe().subscribe({
      next: event => {
        if (isReadyEvent(event)) {
          this.revalidate();
          return;
        }
        if (!this.options.applyEvent) {
          this.revalidate();
          return;
        }
        if (this.options.applyEvent(event) === 'revalidate') {
          this.revalidate();
        }
      },
      error: error => {
        if (this.generation === generation) {
          this.options.onError?.(error);
        }
      },
    });
  }

  revalidate() {
    if (!this.started) {
      return;
    }
    this.requestController?.abort();
    const controller = new AbortController();
    this.requestController = controller;
    const generation = this.generation;
    this.options.request(controller.signal).then(
      snapshot => {
        if (
          this.started &&
          this.generation === generation &&
          this.requestController === controller &&
          !controller.signal.aborted
        ) {
          this.options.applySnapshot(snapshot);
        }
      },
      error => {
        if (
          this.started &&
          this.generation === generation &&
          this.requestController === controller &&
          !controller.signal.aborted
        ) {
          this.options.onError?.(error);
        }
      }
    );
  }

  stop() {
    this.started = false;
    this.generation += 1;
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.requestController?.abort();
    this.requestController = undefined;
  }

  dispose() {
    this.stop();
  }
}
