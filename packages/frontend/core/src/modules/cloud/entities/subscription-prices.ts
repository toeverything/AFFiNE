import type { PricesQuery } from '@affine/graphql';
import {
  backoffRetry,
  catchErrorInto,
  effect,
  Entity,
  fromPromise,
  LiveData,
  mapInto,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { exhaustMap } from 'rxjs';

import { isBackendError, isNetworkError } from '../error';
import type { ServerConfigService } from '../services/server-config';
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

  readableLifetimePrice$ = this.proPrice$.map(price =>
    price?.lifetimeAmount
      ? `$${(price.lifetimeAmount / 100).toFixed(2).replace(/\.0+$/, '')}`
      : ''
  );

  constructor(
    private readonly serverConfigService: ServerConfigService,
    private readonly store: SubscriptionStore
  ) {
    super();
  }

  revalidate = effect(
    exhaustMap(() => {
      return fromPromise(async signal => {
        // ensure server config is loaded
        this.serverConfigService.serverConfig.revalidateIfNeeded();

        const serverConfig =
          await this.serverConfigService.serverConfig.features$.waitForNonNull(
            signal
          );

        if (!serverConfig.payment) {
          // No payment feature, no subscription
          return [];
        }
        return this.store.fetchSubscriptionPrices(signal);
      }).pipe(
        backoffRetry({
          when: isNetworkError,
          count: Infinity,
        }),
        backoffRetry({
          when: isBackendError,
        }),
        mapInto(this.prices$),
        catchErrorInto(this.error$),
        onStart(() => this.isRevalidating$.next(true)),
        onComplete(() => this.isRevalidating$.next(false))
      );
    })
  );
}
