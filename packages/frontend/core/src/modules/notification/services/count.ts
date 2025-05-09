import {
  catchErrorInto,
  effect,
  exhaustMapWithTrailing,
  fromPromise,
  LiveData,
  onComplete,
  OnEvent,
  onStart,
  Service,
  smartRetry,
} from '@toeverything/infra';
import { switchMap, tap, timer } from 'rxjs';

import { AccountChanged, type AuthService } from '../../cloud';
import { ServerStarted } from '../../cloud/events/server-started';
import { ApplicationFocused } from '../../lifecycle';
import type { NotificationStore } from '../stores/notification';

@OnEvent(ApplicationFocused, s => s.handleApplicationFocused)
@OnEvent(ServerStarted, s => s.handleServerStarted)
@OnEvent(AccountChanged, s => s.handleAccountChanged)
export class NotificationCountService extends Service {
  constructor(
    private readonly store: NotificationStore,
    private readonly authService: AuthService
  ) {
    super();
  }

  loggedIn$ = this.authService.session.status$.map(v => v === 'authenticated');

  readonly count$ = LiveData.from(this.store.watchNotificationCountCache(), 0);
  readonly isLoading$ = new LiveData(false);
  readonly error$ = new LiveData<any>(null);

  revalidate = effect(
    switchMap(() => {
      return timer(0, 30000); // revalidate every 30 seconds
    }),
    exhaustMapWithTrailing(() => {
      return fromPromise(signal => {
        if (!this.loggedIn$.value) {
          return Promise.resolve(0);
        }
        return this.store.getNotificationCount(signal);
      }).pipe(
        tap(result => {
          this.setCount(result ?? 0);
        }),
        smartRetry(),
        catchErrorInto(this.error$),
        onStart(() => {
          this.isLoading$.setValue(true);
        }),
        onComplete(() => this.isLoading$.setValue(false))
      );
    })
  );

  handleApplicationFocused() {
    this.revalidate();
  }

  handleServerStarted() {
    this.revalidate();
  }

  handleAccountChanged() {
    this.revalidate();
  }

  setCount(count: number) {
    this.store.setNotificationCountCache(count);
  }

  override dispose(): void {
    super.dispose();
    this.revalidate.unsubscribe();
  }
}
