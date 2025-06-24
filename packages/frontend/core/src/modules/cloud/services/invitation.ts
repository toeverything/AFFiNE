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
import { EMPTY, switchMap, tap } from 'rxjs';

import type { AcceptInviteStore } from '../stores/accept-invite';
import type { InviteInfoStore } from '../stores/invite-info';

export type InviteInfo = GetInviteInfoQuery['getInviteInfo'];

export class InvitationService extends Service {
  constructor(
    private readonly acceptInviteStore: AcceptInviteStore,
    private readonly inviteInfoStore: InviteInfoStore
  ) {
    super();
  }
  inviteId$ = new LiveData<string | undefined>(undefined);
  inviteInfo$ = new LiveData<InviteInfo | undefined>(undefined);
  loading$ = new LiveData(false);
  error$ = new LiveData<any>(null);

  readonly getInviteInfo = effect(
    switchMap(({ inviteId }: { inviteId: string }) => {
      if (!inviteId) {
        return EMPTY;
      }
      return fromPromise(async () => {
        return await this.inviteInfoStore.getInviteInfo(inviteId);
      }).pipe(
        tap(res => {
          this.inviteInfo$.setValue(res);
        }),
        smartRetry({
          count: 1,
        }),
        catchErrorInto(this.error$),
        onStart(() => {
          this.inviteId$.setValue(inviteId);
          this.loading$.setValue(true);
          this.inviteInfo$.setValue(undefined);
        }),
        onComplete(() => {
          this.loading$.setValue(false);
        })
      );
    })
  );

  async acceptInvite(inviteId: string) {
    this.getInviteInfo({ inviteId });
    await this.loading$.waitFor(f => !f);
    if (!this.inviteInfo$.value) {
      throw new Error('Invalid invite id');
    }
    return await this.acceptInviteStore.acceptInvite(
      this.inviteInfo$.value.workspace.id,
      inviteId
    );
  }

  override dispose(): void {
    this.getInviteInfo.unsubscribe();
  }
}
