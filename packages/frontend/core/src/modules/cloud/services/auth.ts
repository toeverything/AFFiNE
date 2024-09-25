import { notify } from '@affine/component';
import { AIProvider } from '@affine/core/blocksuite/presets/ai';
import { apis, appInfo, events } from '@affine/electron-api';
import type { OAuthProviderType } from '@affine/graphql';
import { I18n } from '@affine/i18n';
import { track } from '@affine/track';
import {
  ApplicationFocused,
  ApplicationStarted,
  createEvent,
  OnEvent,
  Service,
} from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { distinctUntilChanged, map, skip } from 'rxjs';

import { type AuthAccountInfo, AuthSession } from '../entities/session';
import type { AuthStore } from '../stores/auth';
import type { FetchService } from './fetch';

function toAIUserInfo(account: AuthAccountInfo | null) {
  if (!account) return null;
  return {
    avatarUrl: account.avatar ?? '',
    email: account.email ?? '',
    id: account.id,
    name: account.label,
  };
}

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
  // a random state for login flow
  private state = nanoid();
  session = this.framework.createEntity(AuthSession);

  constructor(
    private readonly fetchService: FetchService,
    private readonly store: AuthStore
  ) {
    super();

    // TODO(@forehalo): make AIProvider a standalone service passed to AI elements by props
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
        AIProvider.slots.userInfo.emit(toAIUserInfo(account));

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

    if (BUILD_CONFIG.isElectron) {
      events?.ui.onAuthenticationRequest(({ method, payload }) => {
        (async () => {
          if (!(await apis?.ui.isActiveTab())) {
            return;
          }
          switch (method) {
            case 'magic-link': {
              const { email, token } = payload;
              await this.signInMagicLink(email, token);
              break;
            }
            case 'oauth': {
              const { code, state, provider, token } = payload;
              if (token) {
                await this.signInOauthToken(token, provider);
              } else {
                await this.signInOauth(code, state, provider);
              }

              break;
            }
          }
        })().catch(e => {
          notify.error({
            title: I18n['com.affine.auth.toast.title.failed'](),
            message: (e as any).message,
          });
        });
      });
    }
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

      this.session.revalidate();
      track.$.$.auth.signedIn({ method: 'magic-link' });
    } catch (e) {
      track.$.$.auth.signInFail({ method: 'magic-link' });
      throw e;
    }
  }

  async oauthPreflight(
    provider: OAuthProviderType,
    client: string,
    oldClient = false,
    /** @deprecated*/ redirectUrl?: string
  ) {
    track.$.$.auth.signIn({ method: 'oauth', provider });
    try {
      // generate a random state for login flow
      this.state = nanoid();
      const res = await this.fetchService.fetch('/api/oauth/preflight', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          redirect_uri: redirectUrl,
          client,
          // only send state for new client login
          state: oldClient ? undefined : this.state,
        }),
        headers: {
          'content-type': 'application/json',
        },
      });

      let { url } = await res.json();

      /** @deprecated old client compatibility */
      if (oldClient) {
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
      }

      return url;
    } catch (e) {
      track.$.$.auth.signInFail({ method: 'oauth', provider });
      throw e;
    }
  }

  async signInOauthToken(token: string, provider: string) {
    try {
      const res = await this.fetchService.fetch('/api/oauth/callback', {
        method: 'POST',
        body: JSON.stringify({ token, state: this.state }),
        headers: {
          'content-type': 'application/json',
        },
      });

      this.session.revalidate();

      track.$.$.auth.signedIn({ method: 'oauth', provider });
      return res.json();
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

      this.session.revalidate();

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
      await this.fetchService.fetch('/api/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify(credential),
        headers: {
          'content-type': 'application/json',
          ...this.captchaHeaders(credential.verifyToken, credential.challenge),
        },
      });
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
