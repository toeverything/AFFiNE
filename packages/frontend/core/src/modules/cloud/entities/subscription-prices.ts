import type { PricesQuery } from '@affine/graphql';
import {
  catchErrorInto,
  effect,
  Entity,
  fromPromise,
  LiveData,
  mapInto,
  onComplete,
  onStart,
  smartRetry,
} from '@toeverything/infra';
import { exhaustMap } from 'rxjs';

import type { ServerService } from '../services/server';
import type { SubscriptionStore } from '../stores/subscription';

export class SubscriptionPrices extends Entity {
  prices$ = new LiveData<PricesQuery['prices'] | null>(null);
  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any | null>(null);

  proPrice$ = this.prices$.map(prices =>
    prices ? prices.find(price => price.plan === 'Pro') : null
  );
  aiPrice$ = this.prices$.map(prices =>
    prices ? prices.find(price => price.plan === 'AI') : null
  );
  teamPrice$ = this.prices$.map(prices =>
    prices ? prices.find(price => price.plan === 'Team') : null
  );

  readableLifetimePrice$ = this.proPrice$.map(price =>
    price?.lifetimeAmount
      ? `$${(price.lifetimeAmount / 100).toFixed(2).replace(/\.0+$/, '')}`
      : ''
  );

  constructor(
    private readonly serverService: ServerService,
    private readonly store: SubscriptionStore
  ) {
    super();
  }

  revalidate = effect(
    exhaustMap(() => {
      return fromPromise(async signal => {
        const serverConfig = this.serverService.server.features$.value;

        if (!serverConfig.payment) {
          // No payment feature, no subscription
          return [];
        }
        return this.store.fetchSubscriptionPrices(signal);
      }).pipe(
        smartRetry(),
        mapInto(this.prices$),
        catchErrorInto(this.error$),
        onStart(() => this.isRevalidating$.next(true)),
        onComplete(() => this.isRevalidating$.next(false))
      );
    })
  );
}
