import {
  catchErrorInto,
  effect,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  Service,
  smartRetry,
} from '@toeverything/infra';
import { EMPTY, exhaustMap, tap } from 'rxjs';

import type { Notification, NotificationStore } from '../stores/notification';
import type { NotificationCountService } from './count';

export class NotificationListService extends Service {
  isLoading$ = new LiveData(false);
  notifications$ = new LiveData<Notification[]>([]);
  nextCursor$ = new LiveData<string | undefined>(undefined);
  hasMore$ = new LiveData(true);
  error$ = new LiveData<any>(null);

  readonly PAGE_SIZE = 8;

  constructor(
    private readonly store: NotificationStore,
    private readonly notificationCount: NotificationCountService
  ) {
    super();
  }

  readonly loadMore = effect(
    exhaustMap(() => {
      if (!this.hasMore$.value) {
        return EMPTY;
      }
      return fromPromise(signal =>
        this.store.listNotification(
          {
            first: this.PAGE_SIZE,
            after: this.nextCursor$.value,
          },
          signal
        )
      ).pipe(
        tap(result => {
          if (!result) {
            // If the user is not logged in, we just ignore the result.
            return;
          }
          const { edges, pageInfo, totalCount } = result;
          this.notifications$.next([
            ...this.notifications$.value,
            ...edges.map(edge => edge.node),
          ]);

          // keep the notification count in sync
          this.notificationCount.setCount(totalCount);

          this.hasMore$.next(pageInfo.hasNextPage);
          this.nextCursor$.next(pageInfo.endCursor ?? undefined);
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

  reset() {
    this.notifications$.setValue([]);
    this.hasMore$.setValue(true);
    this.nextCursor$.setValue(undefined);
    this.isLoading$.setValue(false);
    this.error$.setValue(null);
    this.loadMore.reset();
  }

  async readNotification(id: string) {
    await this.store.readNotification(id);
    this.notifications$.next(
      this.notifications$.value.filter(notification => notification.id !== id)
    );
    this.notificationCount.setCount(
      Math.max(this.notificationCount.count$.value - 1, 0)
    );
  }

  async readAllNotifications() {
    // optimistic clear all notifications
    this.reset();
    this.notificationCount.setCount(0);
    // avoid loading more notifications after clear all notifications
    this.hasMore$.setValue(false);

    try {
      await this.store.readAllNotifications();
    } catch (err) {
      // rollback the optimistic clear all notifications
      this.reset();
      this.loadMore();

      // rethrow the error to the caller, to notify the user
      throw err;
    }
  }
}
