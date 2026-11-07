import {
  SubscriptionPlan,
  type SubscriptionQuery,
  SubscriptionRecurring,
} from '@affine/graphql';
import {
  catchErrorInto,
  effect,
  Entity,
  exhaustMapSwitchUntilChanged,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { map, tap } from 'rxjs';

import type { AuthService } from '../services/auth';
import type { ServerService } from '../services/server';
import type { SubscriptionStore } from '../stores/subscription';

export type SubscriptionBilling = NonNullable<
  SubscriptionQuery['currentUser']
>['subscriptionBilling'];

export type SubscriptionType = SubscriptionBilling['subscriptions'][number];

export class Subscription extends Entity {
  // undefined means no user, null means loading
  billing$ = new LiveData<SubscriptionBilling | null | undefined>(null);
  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<unknown>(null);

  subscription$ = this.billing$.map<SubscriptionType[] | null | undefined>(
    billing => (billing ? billing.subscriptions : billing)
  );
  conflicts$ = this.billing$.map(billing => billing?.conflicts);
  manageable$ = this.billing$.map(billing => billing?.manageable);

  pro$ = this.subscription$.map(subscriptions =>
    subscriptions
      ? subscriptions.find(sub => sub.plan === SubscriptionPlan.Pro)
      : null
  );
  ai$ = this.subscription$.map(subscriptions =>
    subscriptions
      ? subscriptions.find(sub => sub.plan === SubscriptionPlan.AI)
      : null
  );
  isBeliever$ = this.pro$.map(
    sub => sub?.recurring === SubscriptionRecurring.Lifetime
  );

  constructor(
    private readonly authService: AuthService,
    private readonly serverService: ServerService,
    private readonly store: SubscriptionStore
  ) {
    super();
  }

  async resumeSubscription(idempotencyKey: string, plan?: SubscriptionPlan) {
    await this.store.mutateResumeSubscription(idempotencyKey, plan);
    await this.waitForRevalidation();
  }

  async cancelSubscription(idempotencyKey: string, plan?: SubscriptionPlan) {
    await this.store.mutateCancelSubscription(idempotencyKey, plan);
    await this.waitForRevalidation();
  }

  async setSubscriptionRecurring(
    idempotencyKey: string,
    recurring: SubscriptionRecurring,
    plan?: SubscriptionPlan
  ) {
    await this.store.setSubscriptionRecurring(idempotencyKey, recurring, plan);
    await this.waitForRevalidation();
  }

  async waitForRevalidation(signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (this.isRevalidating$.value) {
      await this.isRevalidating$.waitFor(
        isRevalidating => !isRevalidating,
        signal
      );
    }
    signal?.throwIfAborted();
    this.revalidate();
    await this.isRevalidating$.waitFor(
      isRevalidating => !isRevalidating,
      signal
    );
  }

  revalidate = effect(
    map(() => ({
      accountId: this.authService.session.account$.value?.id,
    })),
    exhaustMapSwitchUntilChanged(
      (a, b) => a.accountId === b.accountId,
      ({ accountId }) => {
        return fromPromise(async signal => {
          if (!accountId) {
            return undefined;
          }

          const serverConfig =
            await this.serverService.server.features$.waitForNonNull(signal);

          if (!serverConfig.payment) {
            return {
              userId: accountId,
              billing: { subscriptions: [], conflicts: [], manageable: [] },
            };
          }
          const data = await this.store.fetchSubscriptionBilling(signal);
          if (data?.userId !== accountId) {
            signal.throwIfAborted();
            this.billing$.next(null);
            this.authService.session.revalidate();
            throw new Error('Subscription billing account changed');
          }
          return data;
        }).pipe(
          tap(data => {
            if (data) {
              this.store.setCachedSubscriptionBilling(
                data.userId,
                data.billing
              );
            }
            this.billing$.next(data?.billing);
          }),
          catchErrorInto(this.error$),
          onStart(() => {
            this.error$.next(null);
            this.isRevalidating$.next(true);
          }),
          onComplete(() => this.isRevalidating$.next(false))
        );
      },
      ({ accountId }) => {
        this.billing$.next(
          accountId
            ? (this.store.getCachedSubscriptionBilling(accountId) ?? null)
            : undefined
        );
        this.error$.next(null);
      }
    )
  );

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
