import {
  catchErrorInto,
  effect,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  Service,
} from '@toeverything/infra';
import { exhaustMap, switchMap, tap } from 'rxjs';

import type { ValidatorProvider } from '../provider/validator';
import type { FetchService } from './fetch';
import type { ServerService } from './server';

export class CaptchaService extends Service {
  needCaptcha$ = this.serverService.server.features$.map(
    r => r?.captcha || false
  );
  challenge$ = new LiveData<string | undefined>(undefined);
  provider$ = new LiveData<'hashcash' | 'turnstile' | undefined>(undefined);
  turnstile$ = new LiveData<{ siteKey: string; action: string } | undefined>(
    undefined
  );
  isLoading$ = new LiveData(false);
  verifyToken$ = new LiveData<string | undefined>(undefined);
  error$ = new LiveData<any | undefined>(undefined);

  constructor(
    private readonly serverService: ServerService,
    private readonly fetchService: FetchService,
    public readonly validatorProvider?: ValidatorProvider
  ) {
    super();
  }

  revalidate = effect(
    exhaustMap(() => {
      return fromPromise(async signal => {
        if (!this.needCaptcha$.value) {
          return {};
        }
        const res = await this.fetchService.fetch('/api/auth/captcha', {
          signal,
        });
        const data = (await res.json()) as {
          provider: 'hashcash' | 'turnstile';
          challenge?: string;
          resource?: string;
          siteKey?: string;
          action?: string;
        };
        if (data.provider === 'turnstile') {
          if (!data.siteKey || !data.action) {
            throw new Error('Invalid Turnstile configuration');
          }
          return {
            provider: data.provider,
            turnstile: { siteKey: data.siteKey, action: data.action },
          };
        }
        if (
          data.provider !== 'hashcash' ||
          !data.challenge ||
          !data.resource ||
          !this.validatorProvider
        ) {
          throw new Error('Invalid Hashcash challenge');
        }
        const token = await this.validatorProvider.validate(
          data.challenge,
          data.resource
        );
        return {
          provider: data.provider,
          token,
          challenge: data.challenge,
        };
      }).pipe(
        tap(({ challenge, provider, token, turnstile }) => {
          this.provider$.next(provider);
          this.turnstile$.next(turnstile);
          this.verifyToken$.next(token);
          this.challenge$.next(challenge);
          if (token) this.resetAfter5min();
        }),
        catchErrorInto(this.error$),
        onStart(() => {
          this.error$.next(undefined);
          this.challenge$.next(undefined);
          this.provider$.next(undefined);
          this.turnstile$.next(undefined);
          this.verifyToken$.next(undefined);
          this.isLoading$.next(true);
        }),
        onComplete(() => this.isLoading$.next(false))
      );
    })
  );

  resetAfter5min = effect(
    switchMap(() => {
      return fromPromise(async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 1000 * 60 * 5);
        });
        return true;
      }).pipe(
        tap(_ => {
          this.challenge$.next(undefined);
          this.provider$.next(undefined);
          this.turnstile$.next(undefined);
          this.verifyToken$.next(undefined);
          this.isLoading$.next(false);
        })
      );
    })
  );
}
