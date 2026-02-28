import { UserFriendlyError } from '@affine/error';
import type { OAuthProviderType } from '@affine/graphql';
import { track } from '@affine/track';
import { OnEvent, Service } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { distinctUntilChanged, map, skip } from 'rxjs';

import type { GlobalDialogService } from '../../dialogs';
import { ApplicationFocused } from '../../lifecycle';
import type { UrlService } from '../../url';
import { AuthSession } from '../entities/session';
import { AccountChanged } from '../events/account-changed';
import { AccountLoggedIn } from '../events/account-logged-in';
import { AccountLoggedOut } from '../events/account-logged-out';
import { ServerStarted } from '../events/server-started';
import type { AuthStore } from '../stores/auth';
import type { FetchService } from './fetch';

@OnEvent(ApplicationFocused, e => e.onApplicationFocused)
@OnEvent(ServerStarted, e => e.onServerStarted)
export class AuthService extends Service {
  session = this.framework.createEntity(AuthSession);

  constructor(
    private readonly fetchService: FetchService,
    private readonly store: AuthStore,
    private readonly urlService: UrlService,
    private readonly dialogService: GlobalDialogService
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

  private onServerStarted() {
    this.session.revalidate();
  }

  private onApplicationFocused() {
    this.session.revalidate();
  }

  async sendEmailMagicLink(
    email: string,
    verifyToken?: string,
    challenge?: string,
    redirectUrl?: string // url to redirect to after signed-in
  ) {
    track.$.$.auth.signIn({ method: 'magic-link' });
    this.setClientNonce();
    try {
      const scheme = this.urlService.getClientScheme();
      const magicLinkUrlParams = new URLSearchParams();
      if (redirectUrl) {
        magicLinkUrlParams.set('redirect_uri', redirectUrl);
      }
      if (scheme) {
        magicLinkUrlParams.set('client', scheme);
      }
      await this.fetchService.fetch('/api/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify({
          email,
          // we call it [callbackUrl] instead of [redirect_uri]
          // to make it clear the url is used to finish the sign-in process instead of redirect after signed-in
          callbackUrl: `/magic-link?${magicLinkUrlParams.toString()}`,
          client_nonce: this.store.getClientNonce(),
        }),
        headers: {
          'content-type': 'application/json',
          ...(verifyToken ? this.captchaHeaders(verifyToken, challenge) : {}),
        },
      });
    } catch (e) {
      track.$.$.auth.signInFail({
        method: 'magic-link',
        reason: UserFriendlyError.fromAny(e).name,
      });
      throw e;
    }
  }

  async signInMagicLink(email: string, token: string, byLink = true) {
    const method = byLink ? 'magic-link' : 'otp';
    try {
      await this.store.signInMagicLink(email, token);

      this.session.revalidate();
      track.$.$.auth.signedIn({ method });
    } catch (e) {
      track.$.$.auth.signInFail({
        method,
        reason: UserFriendlyError.fromAny(e).name,
      });
      throw e;
    }
  }

  async oauthPreflight(
    provider: OAuthProviderType,
    client: string,
    /** @deprecated*/ redirectUrl?: string
  ): Promise<Record<string, string>> {
    this.setClientNonce();
    try {
      const res = await this.fetchService.fetch('/api/oauth/preflight', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          client,
          redirect_uri: redirectUrl,
          client_nonce: this.store.getClientNonce(),
        }),
        headers: {
          'content-type': 'application/json',
        },
      });

      return await res.json();
    } catch (e) {
      track.$.$.auth.signInFail({
        method: 'oauth',
        provider,
        reason: UserFriendlyError.fromAny(e).name,
      });
      throw e;
    }
  }

  async signInOauth(code: string, state: string, provider: string) {
    try {
      const { redirectUri } = await this.store.signInOauth(
        code,
        state,
        provider
      );

      this.session.revalidate();

      track.$.$.auth.signedIn({ method: 'oauth', provider });
      return { redirectUri };
    } catch (e) {
      track.$.$.auth.signInFail({
        method: 'oauth',
        provider,
        reason: UserFriendlyError.fromAny(e).name,
      });
      throw e;
    }
  }

  async signInPassword(credential: {
    email: string;
    password: string;
    verifyToken?: string;
    challenge?: string;
  }) {
    track.$.$.auth.signIn({ method: 'password' });
    try {
      await this.store.signInPassword(credential);
      this.session.revalidate();
      track.$.$.auth.signedIn({ method: 'password' });
    } catch (e) {
      track.$.$.auth.signInFail({
        method: 'password',
        reason: UserFriendlyError.fromAny(e).name,
      });
      throw e;
    }
  }

  async signOut() {
    await this.store.signOut();
    this.store.setCachedAuthSession(null);
    this.session.revalidate();
  }

  async deleteAccount() {
    const res = await this.store.deleteAccount();
    this.store.setCachedAuthSession(null);
    this.session.revalidate();
    this.dialogService.open('deleted-account', {});
    return res;
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

  private setClientNonce() {
    if (BUILD_CONFIG.isNative) {
      // send random client nonce on native app
      this.store.setClientNonce(nanoid());
    }
  }
}
