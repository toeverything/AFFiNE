import { AIProvider } from '@affine/core/blocksuite/presets/ai';
import { buildAppUrl, popupWindow } from '@affine/core/utils';
import { apis, appInfo } from '@affine/electron-api';
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
    challenge?: string
  ) {
    const searchParams = new URLSearchParams();
    if (challenge) {
      searchParams.set('challenge', challenge);
    }
    searchParams.set('token', verifyToken);

    const res = await this.fetchService.fetch(
      '/api/auth/sign-in?' + searchParams.toString(),
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          // we call it [callbackUrl] instead of [redirect_uri]
          // to make it clear the url is used to finish the sign-in process instead of redirect after signed-in
          callbackUrl: buildAppUrl('/magic-link', {
            desktop: environment.isDesktop,
            openInHiddenWindow: true,
            redirectFromWeb: true,
          }),
        }),
        headers: {
          'content-type': 'application/json',
        },
      }
    );
    if (!res.ok) {
      throw new Error('Failed to send email');
    }
  }

  async signInOauth(provider: OAuthProviderType) {
    const res = await this.fetchService.fetch('/api/oauth/preflight', {
      method: 'POST',
      body: JSON.stringify({ provider }),
      headers: {
        'content-type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to sign in with ${provider}`);
    }

    let { url } = await res.json();

    // change `state=xxx` to `state={state:xxx,native:true}`
    // so we could know the callback should be redirect to native app
    const oauthUrl = new URL(url);
    oauthUrl.searchParams.set(
      'state',
      JSON.stringify({
        state: oauthUrl.searchParams.get('state'),
        client: environment.isDesktop ? appInfo?.schema : 'web',
      })
    );
    url = oauthUrl.toString();

    if (environment.isDesktop) {
      await apis?.ui.openExternal(url);
    } else {
      popupWindow(url);
    }

    return;
  }

  async signInPassword(credential: { email: string; password: string }) {
    const res = await this.fetchService.fetch('/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify(credential),
      headers: {
        'content-type': 'application/json',
      },
    });
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

  checkUserByEmail(email: string) {
    return this.store.checkUserByEmail(email);
  }
}
