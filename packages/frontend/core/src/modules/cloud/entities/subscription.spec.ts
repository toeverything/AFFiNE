import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '@affine/graphql';
import { Framework, LiveData, MemoryMemento } from '@toeverything/infra';
import { describe, expect, test, vi } from 'vitest';

import { GlobalCache } from '../../storage';
import { UrlService } from '../../url';
import { AuthService } from '../services/auth';
import { GraphQLService } from '../services/graphql';
import { ServerService } from '../services/server';
import { SubscriptionStore } from '../stores/subscription';
import { Subscription, type SubscriptionBilling } from './subscription';

const proBilling: SubscriptionBilling = {
  subscriptions: [
    {
      id: 'sub_pro',
      status: SubscriptionStatus.Active,
      plan: SubscriptionPlan.Pro,
      recurring: SubscriptionRecurring.Lifetime,
      start: '2026-09-06T00:00:00.000Z',
      end: null,
      nextBillAt: null,
      canceledAt: null,
      variant: null,
      provider: 'stripe',
      iapStore: null,
    },
  ],
  conflicts: [{ plan: SubscriptionPlan.AI, sources: [] }],
  manageable: [],
};

const basicBilling: SubscriptionBilling = {
  subscriptions: [],
  conflicts: [],
  manageable: [],
};

function createSubscription(serverId: string, cache = new MemoryMemento()) {
  const account$ = new LiveData<{ id: string } | null>({ id: 'user-1' });
  const revalidateSession = vi.fn();
  const gql = vi.fn<
    ({ context }: { context: { signal: AbortSignal } }) => Promise<{
      currentUser: { id: string; subscriptionBilling: SubscriptionBilling };
    }>
  >();
  const framework = new Framework();
  framework
    .impl(GlobalCache, cache)
    .service(AuthService, {
      session: { account$, revalidate: revalidateSession },
    } as unknown as AuthService)
    .service(ServerService, {
      server: { id: serverId, features$: new LiveData({ payment: true }) },
    } as unknown as ServerService)
    .service(GraphQLService, { gql } as unknown as GraphQLService)
    .service(UrlService, {} as UrlService)
    .store(SubscriptionStore, [
      GraphQLService,
      GlobalCache,
      UrlService,
      ServerService,
    ])
    .entity(Subscription, [AuthService, ServerService, SubscriptionStore]);
  return {
    entity: framework.provider().createEntity(Subscription),
    account$,
    gql,
    revalidateSession,
  };
}

describe('Subscription billing', () => {
  test('shows a first load failure, then refreshes every projection from one snapshot', async () => {
    const { entity, gql } = createSubscription('server-1');
    using subscription = entity;
    const error = new Error('billing unavailable');
    gql.mockRejectedValueOnce(error);
    await subscription.waitForRevalidation();
    expect(subscription.billing$.value).toBeNull();
    expect(subscription.error$.value).toBe(error);
    expect(gql).toHaveBeenCalledTimes(1);

    gql.mockResolvedValueOnce({
      currentUser: { id: 'user-1', subscriptionBilling: proBilling },
    });
    const retry = subscription.waitForRevalidation();
    expect(subscription.error$.value).toBeNull();
    await retry;
    expect(gql).toHaveBeenCalledTimes(2);
    expect(subscription.billing$.value).toBe(proBilling);
    expect(subscription.pro$.value).toBe(proBilling.subscriptions[0]);
    expect(subscription.isBeliever$.value).toBe(true);
    expect(subscription.conflicts$.value).toBe(proBilling.conflicts);
    expect(subscription.manageable$.value).toBe(proBilling.manageable);

    gql.mockRejectedValueOnce(error);
    await subscription.waitForRevalidation();
    expect(subscription.billing$.value).toBe(proBilling);
    expect(subscription.error$.value).toBe(error);

    const pending = Promise.withResolvers<Awaited<ReturnType<typeof gql>>>();
    const manageableBilling: SubscriptionBilling = {
      ...basicBilling,
      manageable: [
        {
          plan: SubscriptionPlan.AI,
          sources: [
            {
              id: 'sub_ai',
              provider: 'stripe',
              iapStore: null,
              recurring: SubscriptionRecurring.Yearly,
            },
          ],
        },
      ],
    };
    gql.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({
      currentUser: { id: 'user-1', subscriptionBilling: manageableBilling },
    });
    subscription.revalidate();
    const afterMutation = subscription.waitForRevalidation();
    await vi.waitFor(() => expect(gql).toHaveBeenCalledTimes(4));
    pending.resolve({
      currentUser: { id: 'user-1', subscriptionBilling: proBilling },
    });
    await afterMutation;
    expect(gql).toHaveBeenCalledTimes(5);
    expect(subscription.billing$.value).toBe(manageableBilling);
    expect(subscription.pro$.value).toBeUndefined();
    expect(subscription.conflicts$.value).toEqual([]);
    expect(subscription.manageable$.value).toBe(manageableBilling.manageable);
    expect(subscription.error$.value).toBeNull();
  });

  test('isolates servers and accounts and discards abandoned or mismatched reads', async () => {
    const cache = new MemoryMemento();
    const first = createSubscription('server-1', cache);
    using subscription = first.entity;
    first.gql.mockResolvedValueOnce({
      currentUser: { id: 'user-1', subscriptionBilling: proBilling },
    });
    await subscription.waitForRevalidation();

    const second = createSubscription('server-2', cache);
    using otherServer = second.entity;
    second.gql.mockRejectedValueOnce(new Error('billing unavailable'));
    await otherServer.waitForRevalidation();
    expect(otherServer.billing$.value).toBeNull();

    const pending =
      Promise.withResolvers<Awaited<ReturnType<typeof first.gql>>>();
    first.gql.mockReturnValueOnce(pending.promise);
    subscription.revalidate();
    await vi.waitFor(() => expect(first.gql).toHaveBeenCalledTimes(2));
    const oldSignal = first.gql.mock.calls[1][0].context.signal;
    first.account$.next({ id: 'user-2' });
    first.gql.mockResolvedValueOnce({
      currentUser: { id: 'user-1', subscriptionBilling: proBilling },
    });
    subscription.revalidate();
    expect(oldSignal.aborted).toBe(true);
    expect(subscription.billing$.value).toBeNull();
    pending.resolve({
      currentUser: { id: 'user-1', subscriptionBilling: proBilling },
    });
    await subscription.isRevalidating$.waitFor(value => !value);
    expect(subscription.billing$.value).toBeNull();
    expect(first.revalidateSession).toHaveBeenCalledTimes(1);

    first.gql.mockResolvedValueOnce({
      currentUser: { id: 'user-2', subscriptionBilling: basicBilling },
    });
    await subscription.waitForRevalidation();
    expect(subscription.billing$.value).toBe(basicBilling);
  });
});
