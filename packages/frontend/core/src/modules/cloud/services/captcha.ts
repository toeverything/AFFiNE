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
        const res = await this.fetchService.fetch('/api/auth/challenge', {
          signal,
        });
        const data = (await res.json()) as {
          challenge: string;
          resource: string;
        };
        if (!data || !data.challenge || !data.resource) {
          throw new Error('Invalid challenge');
        }
        if (this.validatorProvider) {
          const token = await this.validatorProvider.validate(
            data.challenge,
            data.resource
          );
          return {
            token,
            challenge: data.challenge,
          };
        }
        return { challenge: data.challenge, token: undefined };
      }).pipe(
        tap(({ challenge, token }) => {
          this.verifyToken$.next(token);
          this.challenge$.next(challenge);
          this.resetAfter5min();
        }),
        catchErrorInto(this.error$),
        onStart(() => {
          this.challenge$.next(undefined);
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
          this.verifyToken$.next(undefined);
          this.isLoading$.next(false);
        })
      );
    })
  );
}
