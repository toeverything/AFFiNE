import type { GetInviteInfoQuery } from '@affine/graphql';
import {
  catchErrorInto,
  effect,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  Service,
  smartRetry,
} from '@toeverything/infra';
import { EMPTY, mergeMap, switchMap } from 'rxjs';

import type { AcceptInviteStore } from '../stores/accept-invite';
import type { InviteInfoStore } from '../stores/invite-info';

export type InviteInfo = GetInviteInfoQuery['getInviteInfo'];

export class AcceptInviteService extends Service {
  constructor(
    private readonly store: AcceptInviteStore,
    private readonly inviteInfoStore: InviteInfoStore
  ) {
    super();
  }
  inviteId$ = new LiveData<string | undefined>(undefined);
  inviteInfo$ = new LiveData<InviteInfo | undefined>(undefined);
  accepted$ = new LiveData<boolean>(false);
  loading$ = new LiveData(false);
  error$ = new LiveData<any>(null);

  readonly acceptInvite = effect(
    switchMap(({ inviteId }: { inviteId: string }) => {
      if (!inviteId) {
        return EMPTY;
      }
      return fromPromise(async () => {
        return await this.inviteInfoStore.getInviteInfo(inviteId);
      }).pipe(
        mergeMap(res => {
          this.inviteInfo$.setValue(res);
          return fromPromise(async () => {
            return await this.store.acceptInvite(
              res.workspace.id,
              inviteId,
              true
            );
          });
        }),
        mergeMap(res => {
          this.accepted$.next(res);
          return EMPTY;
        }),
        smartRetry({
          count: 1,
        }),
        catchErrorInto(this.error$),
        onStart(() => {
          this.inviteId$.setValue(inviteId);
          this.loading$.setValue(true);
          this.inviteInfo$.setValue(undefined);
          this.accepted$.setValue(false);
        }),
        onComplete(() => {
          this.loading$.setValue(false);
        })
      );
    })
  );

  async waitForAcceptInvite(inviteId: string) {
    this.acceptInvite({ inviteId });
    await this.loading$.waitFor(f => !f);
    if (this.accepted$.value) {
      return true; // invite is accepted
    }

    if (this.error$.value) {
      throw this.error$.value;
    }

    return false; // invite is expired
  }

  override dispose(): void {
    this.acceptInvite.unsubscribe();
  }
}
