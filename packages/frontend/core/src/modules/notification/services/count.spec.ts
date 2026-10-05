import { Framework, LiveData } from '@toeverything/infra';
import { Subject } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import { AuthService } from '../../cloud/services/auth';
import { NbstoreService } from '../../storage/services/nbstore';
import { NotificationStore } from '../stores/notification';
import { NotificationCountService } from './count';

function createCountService() {
  const events$ = new Subject<{ type: 'ready' } | { count: number }>();
  const request = vi.fn().mockResolvedValue({ count: 1 });
  const cache = new LiveData(0);
  const setNotificationCountCache = vi.fn((count: number) =>
    cache.setValue(count)
  );
  const store = {
    watchNotificationCountCache: () => cache,
    setNotificationCountCache,
  } as unknown as NotificationStore;
  const auth = {
    session: {
      status$: new LiveData<'authenticated' | 'unauthenticated'>(
        'authenticated'
      ),
    },
  } as unknown as AuthService;
  const nbstore = {
    realtime: {
      request,
      subscribe: () => events$,
    },
  } as unknown as NbstoreService;

  const framework = new Framework();
  framework.service(AuthService, auth);
  framework.store(NotificationStore, store);
  framework.service(NbstoreService, nbstore);
  framework.service(NotificationCountService, [
    NotificationStore,
    AuthService,
    NbstoreService,
  ]);

  return {
    events$,
    request,
    service: framework.provider().get(NotificationCountService),
    setNotificationCountCache,
  };
}

describe('NotificationCountService', () => {
  test('uses snapshots for reconnects and applies realtime count changes', async () => {
    const { events$, request, service, setNotificationCountCache } =
      createCountService();

    expect(service.loggedIn$.value).toBe(true);
    service.handleServerStarted();
    events$.next({ type: 'ready' });
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    await vi.waitFor(() => expect(service.count$.value).toBe(1));

    events$.next({ count: 3 });
    expect(service.count$.value).toBe(3);
    expect(setNotificationCountCache).toHaveBeenLastCalledWith(3);

    const requestsBeforeFocus = request.mock.calls.length;
    service.handleApplicationFocused();
    events$.next({ type: 'ready' });
    await vi.waitFor(() =>
      expect(request.mock.calls.length).toBeGreaterThan(requestsBeforeFocus)
    );
    await vi.waitFor(() => expect(service.count$.value).toBe(1));
    service.dispose();
  });
});
