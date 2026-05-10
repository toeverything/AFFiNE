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
import type { Subscription } from 'rxjs';
import { tap } from 'rxjs';

import { AccountChanged, type AuthService } from '../../cloud';
import { ServerStarted } from '../../cloud/events/server-started';
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
  private subscription?: Subscription;

  revalidate = effect(
    exhaustMapWithTrailing(() => {
      return fromPromise(() => {
        if (!this.loggedIn$.value) {
          return Promise.resolve(0);
        }
        return this.nbstoreService.realtime
          .request('notification.count.get', {}, { timeoutMs: 10000 })
          .then(result => result.count);
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
    this.subscribe();
    this.revalidate();
  }

  handleAccountChanged() {
    this.subscribe();
    this.revalidate();
  }

  setCount(count: number) {
    this.store.setNotificationCountCache(count);
  }

  override dispose(): void {
    super.dispose();
    this.revalidate.unsubscribe();
    this.subscription?.unsubscribe();
  }

  private subscribe() {
    this.subscription?.unsubscribe();
    if (!this.loggedIn$.value) {
      return;
    }
    this.subscription = this.nbstoreService.realtime
      .subscribe('notification.count.changed', {})
      .subscribe({
        next: event => {
          if ('type' in event) {
            this.revalidate();
          } else {
            this.setCount(event.count);
          }
        },
        error: error => {
          this.error$.setValue(error);
        },
      });
  }
}
