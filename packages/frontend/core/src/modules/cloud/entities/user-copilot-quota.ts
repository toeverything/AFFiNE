import {
  catchErrorInto,
  effect,
  Entity,
  exhaustMapSwitchUntilChanged,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  smartRetry,
} from '@toeverything/infra';
import { map, tap } from 'rxjs';

import type { AuthService } from '../services/auth';
import type { ServerService } from '../services/server';
import type { UserCopilotQuotaStore } from '../stores/user-copilot-quota';

export class UserCopilotQuota extends Entity {
  copilotActionLimit$ = new LiveData<number | 'unlimited' | null>(null);
  copilotActionUsed$ = new LiveData<number | null>(null);

  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any | null>(null);

  constructor(
    private readonly authService: AuthService,
    private readonly store: UserCopilotQuotaStore,
    private readonly serverService: ServerService
  ) {
    super();
  }

  revalidate = effect(
    map(() => ({
      accountId: this.authService.session.account$.value?.id,
    })),
    exhaustMapSwitchUntilChanged(
      (a, b) => a.accountId === b.accountId,
      ({ accountId }) =>
        fromPromise(async signal => {
          if (!accountId) {
            return; // no quota if no user
          }

          const serverConfig =
            await this.serverService.server.features$.waitForNonNull(signal);

          let aiQuota = null;

          if (serverConfig.copilot) {
            aiQuota = await this.store.fetchUserCopilotQuota(signal);
          }

          return aiQuota;
        }).pipe(
          smartRetry(),
          tap(data => {
            if (data) {
              const { limit, used } = data;
              this.copilotActionUsed$.next(used);
              this.copilotActionLimit$.next(
                limit === null ? 'unlimited' : limit
              ); // fix me: unlimited status
            } else {
              this.copilotActionUsed$.next(null);
              this.copilotActionLimit$.next(null);
            }
          }),
          catchErrorInto(this.error$),
          onStart(() => this.isRevalidating$.next(true)),
          onComplete(() => this.isRevalidating$.next(false))
        ),
      () => {
        // Reset the state when the user is changed
        this.reset();
      }
    )
  );

  reset() {
    this.copilotActionUsed$.next(null);
    this.copilotActionLimit$.next(null);
    this.error$.next(null);
    this.isRevalidating$.next(false);
  }

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
