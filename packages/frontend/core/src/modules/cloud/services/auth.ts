import { appInfo } from '@affine/electron-api';
import type { OAuthProviderType } from '@affine/graphql';
import { track } from '@affine/track';
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

@OnEvent(ApplicationStarted, e => e.onApplicationStart)
@OnEvent(ApplicationFocused, e => e.onApplicationFocused)
export class AuthService extends Service {
  session = this.framework.createEntity(AuthSession);

  constructor(
    private readonly fetchService: FetchService,
    private readonly store: AuthStore
  ) {
    super();

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
    track.$.$.auth.signIn({ method: 'magic-link' });
    try {
      await this.fetchService.fetch('/api/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify({
          email,
          // we call it [callbackUrl] instead of [redirect_uri]
          // to make it clear the url is used to finish the sign-in process instead of redirect after signed-in
          callbackUrl: `/magic-link?client=${BUILD_CONFIG.isElectron ? appInfo?.schema : 'web'}`,
        }),
        headers: {
          'content-type': 'application/json',
          ...this.captchaHeaders(verifyToken, challenge),
        },
      });
    } catch (e) {
      track.$.$.auth.signInFail({ method: 'magic-link' });
      throw e;
    }
  }

  async signInMagicLink(email: string, token: string) {
    try {
      await this.fetchService.fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, token }),
      });
      track.$.$.auth.signedIn({ method: 'magic-link' });
    } catch (e) {
      track.$.$.auth.signInFail({ method: 'magic-link' });
      throw e;
    }
  }

  async oauthPreflight(
    provider: OAuthProviderType,
    client: string,
    /** @deprecated*/ redirectUrl?: string
  ) {
    track.$.$.auth.signIn({ method: 'oauth', provider });
    try {
      const res = await this.fetchService.fetch('/api/oauth/preflight', {
        method: 'POST',
        body: JSON.stringify({ provider, redirect_uri: redirectUrl }),
        headers: {
          'content-type': 'application/json',
        },
      });

      let { url } = await res.json();

      // change `state=xxx` to `state={state:xxx,native:true}`
      // so we could know the callback should be redirect to native app
      const oauthUrl = new URL(url);
      oauthUrl.searchParams.set(
        'state',
        JSON.stringify({
          state: oauthUrl.searchParams.get('state'),
          client,
          provider,
        })
      );
      url = oauthUrl.toString();

      return url;
    } catch (e) {
      track.$.$.auth.signInFail({ method: 'oauth', provider });
      throw e;
    }
  }

  async signInOauth(code: string, state: string, provider: string) {
    try {
      const res = await this.fetchService.fetch('/api/oauth/callback', {
        method: 'POST',
        body: JSON.stringify({ code, state }),
        headers: {
          'content-type': 'application/json',
        },
      });

      track.$.$.auth.signedIn({ method: 'oauth', provider });
      return res.json();
    } catch (e) {
      track.$.$.auth.signInFail({ method: 'oauth', provider });
      throw e;
    }
  }

  async signInPassword(credential: {
    email: string;
    password: string;
    verifyToken: string;
    challenge?: string;
  }) {
    track.$.$.auth.signIn({ method: 'password' });
    try {
      const res = await this.fetchService.fetch('/api/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify(credential),
        headers: {
          'content-type': 'application/json',
          ...this.captchaHeaders(credential.verifyToken, credential.challenge),
        },
      });
      if (!res.ok) {
        throw new Error('Failed to sign in');
      }
      this.session.revalidate();
      track.$.$.auth.signedIn({ method: 'password' });
    } catch (e) {
      track.$.$.auth.signInFail({ method: 'password' });
      throw e;
    }
  }

  async signOut() {
    await this.fetchService.fetch('/api/auth/sign-out');
    this.store.setCachedAuthSession(null);
    this.session.revalidate();
  }

  checkUserByEmail(email: string) {
    return this.store.checkUserByEmail(email);
  }

  captchaHeaders(token: string, challenge?: string) {
    const headers: Record<string, string> = {
      'x-captcha-token': token,
    };

    if (challenge) {
      headers['x-captcha-challenge'] = challenge;
    }

    return headers;
  }
}
