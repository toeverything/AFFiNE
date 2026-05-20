import { LiveData, OnEvent, Service } from '@toeverything/infra';

import { AccountChanged } from '../events/account-changed';
import { RealtimeLiveQuery } from '../realtime/live-query';
import type {
  AccessToken,
  AccessTokenStore,
  ListedAccessToken,
} from '../stores/access-token';

@OnEvent(AccountChanged, e => e.onAccountChanged)
export class AccessTokenService extends Service {
  constructor(private readonly accessTokenStore: AccessTokenStore) {
    super();
    this.liveQuery.start();
  }

  accessTokens$ = new LiveData<ListedAccessToken[] | null>(null);
  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any>(null);
  private readonly liveQuery = new RealtimeLiveQuery({
    request: signal => this.requestAccessTokens(signal),
    subscribe: () => this.accessTokenStore.subscribeUserAccessTokens(),
    applySnapshot: accessTokens => {
      this.error$.value = null;
      this.accessTokens$.value = accessTokens;
    },
    applyEvent: () => 'revalidate' as const,
    onError: error => {
      this.error$.value = error;
    },
  });

  async generateUserAccessToken(name: string): Promise<AccessToken> {
    const accessToken =
      await this.accessTokenStore.generateUserAccessToken(name);
    const { token: _token, ...listedAccessToken } = accessToken;
    this.accessTokens$.value = [
      ...(this.accessTokens$.value || []),
      listedAccessToken,
    ];

    await this.waitForRevalidation();

    return accessToken;
  }

  async revokeUserAccessToken(id: string) {
    await this.accessTokenStore.revokeUserAccessToken(id);
    this.accessTokens$.value =
      this.accessTokens$.value?.filter(token => token.id !== id) ?? null;
    await this.waitForRevalidation();
  }

  revalidate = () => {
    this.liveQuery.revalidate();
  };

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

  override dispose(): void {
    super.dispose();
    this.liveQuery.dispose();
  }

  private async requestAccessTokens(signal: AbortSignal) {
    this.isRevalidating$.value = true;
    try {
      return await this.accessTokenStore.listUserAccessTokens(signal);
    } finally {
      this.isRevalidating$.value = false;
    }
  }
}
