import {
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
import { catchError, EMPTY, tap } from 'rxjs';

import { AccountChanged } from '../events/account-changed';
import type { AccessToken, AccessTokenStore } from '../stores/access-token';

@OnEvent(AccountChanged, e => e.onAccountChanged)
export class AccessTokenService extends Service {
  constructor(private readonly accessTokenStore: AccessTokenStore) {
    super();
  }

  accessTokens$ = new LiveData<AccessToken[] | null>(null);
  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any>(null);

  async generateUserAccessToken(name: string) {
    const accessToken =
      await this.accessTokenStore.generateUserAccessToken(name);
    this.accessTokens$.value = [
      ...(this.accessTokens$.value || []),
      accessToken as AccessToken,
    ];

    await this.waitForRevalidation();
  }

  async revokeUserAccessToken(id: string) {
    await this.accessTokenStore.revokeUserAccessToken(id);
    this.accessTokens$.value =
      this.accessTokens$.value?.filter(token => token.id !== id) ?? null;
    await this.waitForRevalidation();
  }

  revalidate = effect(
    exhaustMapWithTrailing(() => {
      return fromPromise(() => {
        return this.accessTokenStore.listUserAccessTokens();
      }).pipe(
        smartRetry(),
        tap(accessTokens => {
          this.accessTokens$.value = accessTokens;
        }),
        catchError(error => {
          this.error$.value = error;
          return EMPTY;
        }),
        onStart(() => {
          this.isRevalidating$.value = true;
        }),
        onComplete(() => {
          this.isRevalidating$.value = false;
        })
      );
    })
  );

  private onAccountChanged() {
    this.accessTokens$.value = null;
    this.revalidate();
  }

  async waitForRevalidation(signal?: AbortSignal) {
    this.revalidate();
    await this.isRevalidating$.waitFor(
      isRevalidating => !isRevalidating,
      signal
    );
  }
}
