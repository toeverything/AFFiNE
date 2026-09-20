import { Subject } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import { RealtimeLiveQuery } from './live-query';

describe('RealtimeLiveQuery', () => {
  test('requests snapshot when subscription is ready', async () => {
    const events$ = new Subject<{ type: 'ready' } | { count: number }>();
    const applySnapshot = vi.fn();
    const query = new RealtimeLiveQuery({
      request: vi.fn().mockResolvedValue({ count: 1 }),
      subscribe: () => events$,
      applySnapshot,
    });

    query.start();
    events$.next({ type: 'ready' });

    await vi.waitFor(() =>
      expect(applySnapshot).toHaveBeenCalledWith({ count: 1 })
    );
    query.dispose();
  });

  test('applies event without revalidating when applyEvent returns applied', async () => {
    const events$ = new Subject<{ type: 'ready' } | { count: number }>();
    const request = vi.fn().mockResolvedValue({ count: 1 });
    const applyEvent = vi.fn().mockReturnValue('applied');
    const query = new RealtimeLiveQuery({
      request,
      subscribe: () => events$,
      applySnapshot: vi.fn(),
      applyEvent,
    });

    query.start();
    events$.next({ count: 2 });

    expect(applyEvent).toHaveBeenCalledWith({ count: 2 });
    expect(request).not.toHaveBeenCalled();
    query.dispose();
  });

  test('applies business events that include a type field', () => {
    const events$ = new Subject<
      { type: 'ready' } | { type: 'updated'; count: number }
    >();
    const request = vi.fn().mockResolvedValue({ count: 1 });
    const applyEvent = vi.fn().mockReturnValue('applied');
    const query = new RealtimeLiveQuery({
      request,
      subscribe: () => events$,
      applySnapshot: vi.fn(),
      applyEvent,
    });

    query.start();
    events$.next({ type: 'updated', count: 2 });

    expect(applyEvent).toHaveBeenCalledWith({ type: 'updated', count: 2 });
    expect(request).not.toHaveBeenCalled();
    query.dispose();
  });

  test('revalidates event when applyEvent asks for it', async () => {
    const events$ = new Subject<{ type: 'ready' } | { changed: true }>();
    const applySnapshot = vi.fn();
    const query = new RealtimeLiveQuery({
      request: vi.fn().mockResolvedValue({ changes: [] }),
      subscribe: () => events$,
      applySnapshot,
      applyEvent: () => 'revalidate',
    });

    query.start();
    events$.next({ changed: true });

    await vi.waitFor(() =>
      expect(applySnapshot).toHaveBeenCalledWith({ changes: [] })
    );
    query.dispose();
  });

  test('passes subscription and request errors to onError', async () => {
    const events$ = new Subject<{ type: 'ready' }>();
    const onError = vi.fn();
    const requestError = new Error('request failed');
    const query = new RealtimeLiveQuery({
      request: vi.fn().mockRejectedValue(requestError),
      subscribe: () => events$,
      applySnapshot: vi.fn(),
      onError,
    });

    query.start();
    events$.next({ type: 'ready' });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(requestError));

    const subscriptionError = new Error('subscribe failed');
    events$.error(subscriptionError);
    expect(onError).toHaveBeenCalledWith(subscriptionError);
    query.dispose();
  });

  test('dispose aborts in-flight request and ignores stale result', async () => {
    const events$ = new Subject<{ type: 'ready' }>();
    const applySnapshot = vi.fn();
    let resolveRequest: (value: { count: number }) => void = () => {};
    const query = new RealtimeLiveQuery({
      request: vi.fn(
        () =>
          new Promise<{ count: number }>(resolve => {
            resolveRequest = resolve;
          })
      ),
      subscribe: () => events$,
      applySnapshot,
    });

    query.start();
    events$.next({ type: 'ready' });
    query.dispose();
    resolveRequest({ count: 1 });

    await Promise.resolve();
    expect(applySnapshot).not.toHaveBeenCalled();
  });

  test('new request supersedes older in-flight result', async () => {
    const events$ = new Subject<{ type: 'ready' }>();
    const applySnapshot = vi.fn();
    const resolvers: Array<(value: { count: number }) => void> = [];
    const query = new RealtimeLiveQuery({
      request: vi.fn(
        () =>
          new Promise<{ count: number }>(resolve => {
            resolvers.push(resolve);
          })
      ),
      subscribe: () => events$,
      applySnapshot,
    });

    query.start();
    events$.next({ type: 'ready' });
    events$.next({ type: 'ready' });
    resolvers[0]({ count: 1 });
    resolvers[1]({ count: 2 });

    await vi.waitFor(() =>
      expect(applySnapshot).toHaveBeenCalledWith({ count: 2 })
    );
    expect(applySnapshot).toHaveBeenCalledTimes(1);
    query.dispose();
  });
});
