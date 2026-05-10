import { LiveData, OnEvent, Service } from '@toeverything/infra';

import { AccountChanged, type AuthService } from '../../cloud';
import { ServerStarted } from '../../cloud/events/server-started';
import { RealtimeLiveQuery } from '../../cloud/realtime/live-query';
import { ApplicationFocused } from '../../lifecycle';
import type { NbstoreService } from '../../storage';
import type { NotificationStore } from '../stores/notification';

@OnEvent(ApplicationFocused, s => s.handleApplicationFocused)
@OnEvent(ServerStarted, s => s.handleServerStarted)
@OnEvent(AccountChanged, s => s.handleAccountChanged)
export class NotificationCountService extends Service {
  constructor(
    private readonly store: NotificationStore,
    private readonly authService: AuthService,
    private readonly nbstoreService: NbstoreService
  ) {
    super();
  }

  loggedIn$ = this.authService.session.status$.map(v => v === 'authenticated');

  readonly count$ = LiveData.from(this.store.watchNotificationCountCache(), 0);
  readonly isLoading$ = new LiveData(false);
  readonly error$ = new LiveData<any>(null);
  private readonly liveQuery = new RealtimeLiveQuery({
    request: signal => this.requestCount(signal),
    subscribe: () =>
      this.nbstoreService.realtime.subscribe('notification.count.changed', {}),
    applySnapshot: result => this.setCount(result.count),
    applyEvent: event => {
      this.setCount(event.count);
      return 'applied';
    },
    onError: error => this.error$.setValue(error),
  });

  revalidate = () => {
    if (!this.loggedIn$.value) {
      this.setCount(0);
      return;
    }
    this.liveQuery.revalidate();
  };

  handleApplicationFocused() {
    this.revalidate();
  }

  handleServerStarted() {
    this.subscribe();
    this.revalidate();
  }

  handleAccountChanged() {
    this.subscribe();
    this.revalidate();
  }

  setCount(count: number) {
    this.error$.setValue(null);
    this.store.setNotificationCountCache(count);
  }

  override dispose(): void {
    super.dispose();
    this.liveQuery.dispose();
  }

  private subscribe() {
    if (!this.loggedIn$.value) {
      this.liveQuery.stop();
      this.setCount(0);
      return;
    }
    this.liveQuery.start();
  }

  private async requestCount(signal: AbortSignal) {
    this.isLoading$.setValue(true);
    try {
      return await this.nbstoreService.realtime.request(
        'notification.count.get',
        {},
        { signal, timeoutMs: 10000 }
      );
    } finally {
      this.isLoading$.setValue(false);
    }
  }
}
