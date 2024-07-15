import { AIProvider } from '@affine/core/blocksuite/presets/ai';
import { apis } from '@affine/electron-api';
import type { OAuthProviderType } from '@affine/graphql';
import {
  ApplicationFocused,
  ApplicationStarted,
  createEvent,
  OnEvent,
  Service,
} from '@toeverything/infra';
import { distinctUntilChanged, map, skip } from 'rxjs';

import { type AuthAccountInfo, AuthSession } from '../entities/session';
import type { AuthStore } from '../stores/auth';
import type { FetchService } from './fetch';

// Emit when account changed
export const AccountChanged = createEvent<AuthAccountInfo | null>(
  'AccountChanged'
);

export const AccountLoggedIn = createEvent<AuthAccountInfo>('AccountLoggedIn');

export const AccountLoggedOut =
  createEvent<AuthAccountInfo>('AccountLoggedOut');

function toAIUserInfo(account: AuthAccountInfo | null) {
  if (!account) return null;
  return {
    avatarUrl: account.avatar ?? '',
    email: account.email ?? '',
    id: account.id,
    name: account.label,
  };
}

@OnEvent(ApplicationStarted, e => e.onApplicationStart)
@OnEvent(ApplicationFocused, e => e.onApplicationFocused)
export class AuthService extends Service {
  session = this.framework.createEntity(AuthSession);

  constructor(
    private readonly fetchService: FetchService,
    private readonly store: AuthStore
  ) {
    super();

    AIProvider.provide('userInfo', () => {
      return toAIUserInfo(this.session.account$.value);
    });

    this.session.account$
      .pipe(
        map(a => ({
          id: a?.id,
          account: a,
        })),
        distinctUntilChanged((a, b) => a.id === b.id), // only emit when the value changes
        skip(1) // skip the initial value
      )
      .subscribe(({ account }) => {
        if (account === null) {
          this.eventBus.emit(AccountLoggedOut, account);
        } else {
          this.eventBus.emit(AccountLoggedIn, account);
        }
        this.eventBus.emit(AccountChanged, account);
        AIProvider.slots.userInfo.emit(toAIUserInfo(account));
      });
  }

  private onApplicationStart() {
    this.session.revalidate();
  }

  private onApplicationFocused() {
    this.session.revalidate();
  }

  async sendEmailMagicLink(
    email: string,
    verifyToken: string,
    challenge?: string,
    redirectUri?: string | null
  ) {
    const searchParams = new URLSearchParams();
    if (challenge) {
      searchParams.set('challenge', challenge);
    }
    searchParams.set('token', verifyToken);
    const redirect = environment.isDesktop
      ? this.buildRedirectUri('/open-app/signin-redirect')
      : (redirectUri ?? location.href);
    searchParams.set('redirect_uri', redirect.toString());

    const res = await this.fetchService.fetch(
      '/api/auth/sign-in?' + searchParams.toString(),
      {
        method: 'POST',
        body: JSON.stringify({ email }),
        headers: {
          'content-type': 'application/json',
        },
      }
    );
    if (!res?.ok) {
      throw new Error('Failed to send email');
    }
  }

  async signInOauth(provider: OAuthProviderType, redirectUri?: string | null) {
    if (environment.isDesktop) {
      await apis?.ui.openExternal(
        `${
          runtimeConfig.serverUrlPrefix
        }/desktop-signin?provider=${provider}&redirect_uri=${this.buildRedirectUri(
          '/open-app/signin-redirect'
        )}`
      );
    } else {
      location.href = `${
        runtimeConfig.serverUrlPrefix
      }/oauth/login?provider=${provider}&redirect_uri=${encodeURIComponent(
        redirectUri ?? location.pathname
      )}`;
    }

    return;
  }

  async signInPassword(credential: { email: string; password: string }) {
    const searchParams = new URLSearchParams();
    const redirectUri = new URL(location.href);
    if (environment.isDesktop) {
      redirectUri.pathname = this.buildRedirectUri('/open-app/signin-redirect');
    }
    searchParams.set('redirect_uri', redirectUri.toString());

    const res = await this.fetchService.fetch(
      '/api/auth/sign-in?' + searchParams.toString(),
      {
        method: 'POST',
        body: JSON.stringify(credential),
        headers: {
          'content-type': 'application/json',
        },
      }
    );
    if (!res.ok) {
      throw new Error('Failed to sign in');
    }
    this.session.revalidate();
  }

  async signOut() {
    await this.fetchService.fetch('/api/auth/sign-out');
    this.store.setCachedAuthSession(null);
    this.session.revalidate();
  }

  private buildRedirectUri(callbackUrl: string) {
    const params: string[][] = [];
    if (environment.isDesktop && window.appInfo.schema) {
      params.push(['schema', window.appInfo.schema]);
    }
    const query =
      params.length > 0
        ? '?' +
          params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
        : '';
    return callbackUrl + query;
  }

  checkUserByEmail(email: string) {
    return this.store.checkUserByEmail(email);
  }
}
