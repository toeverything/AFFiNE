import { DocRole, type GetPageGrantedUsersListQuery } from '@affine/graphql';
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
import { EMPTY, exhaustMap, tap } from 'rxjs';

import type { DocService } from '../../doc';
import type { WorkspaceService } from '../../workspace';
import type { DocGrantedUsersStore } from '../stores/doc-granted-users';

export type GrantedUser =
  GetPageGrantedUsersListQuery['workspace']['doc']['grantedUsersList']['edges'][number]['node'];

export class DocGrantedUsersService extends Service {
  constructor(
    private readonly store: DocGrantedUsersStore,
    private readonly workspaceService: WorkspaceService,
    private readonly docService: DocService
  ) {
    super();
  }

  readonly PAGE_SIZE = 8;

  nextCursor$ = new LiveData<string | undefined>(undefined);
  hasMore$ = new LiveData(true);
  grantedUserCount$ = new LiveData(0);
  grantedUsers$ = new LiveData<GrantedUser[]>([]);
  isLoading$ = new LiveData(false);
  error$ = new LiveData<any>(null);

  readonly loadMore = effect(
    exhaustMap(() => {
      if (!this.hasMore$.value) {
        return EMPTY;
      }
      return fromPromise(async signal => {
        return await this.store.fetchDocGrantedUsersList(
          this.workspaceService.workspace.id,
          this.docService.doc.id,
          {
            first: this.PAGE_SIZE,
            after: this.nextCursor$.value,
          },
          signal
        );
      }).pipe(
        tap(({ edges, pageInfo, totalCount }) => {
          this.grantedUsers$.next([
            ...this.grantedUsers$.value,
            ...edges.map(edge => edge.node),
          ]);

          this.grantedUserCount$.next(totalCount);
          this.hasMore$.next(pageInfo.hasNextPage);
          this.nextCursor$.next(pageInfo.endCursor ?? undefined);
        }),
        smartRetry(),
        catchErrorInto(this.error$),
        onStart(() => {
          this.isLoading$.setValue(true);
        }),
        onComplete(() => this.isLoading$.setValue(false))
      );
    })
  );

  reset() {
    this.grantedUsers$.setValue([]);
    this.grantedUserCount$.setValue(0);
    this.hasMore$.setValue(true);
    this.nextCursor$.setValue(undefined);
    this.isLoading$.setValue(false);
    this.error$.setValue(null);
    this.loadMore.reset();
  }

  async grantUsersRole(userIds: string[], role: DocRole) {
    await this.store.grantDocUserRoles({
      docId: this.docService.doc.id,
      workspaceId: this.workspaceService.workspace.id,
      userIds,
      role,
    });
    this.grantedUsers$.next(
      this.grantedUsers$.value.map(user => {
        if (userIds.includes(user.user.id)) {
          return { ...user, role };
        }
        return user;
      })
    );
  }

  async revokeUsersRole(userId: string) {
    await this.store.revokeDocUserRoles(
      this.workspaceService.workspace.id,
      this.docService.doc.id,
      userId
    );
    this.grantedUsers$.next(
      this.grantedUsers$.value.filter(user => user.user.id !== userId)
    );
    if (this.grantedUserCount$.value > 0) {
      this.grantedUserCount$.next(this.grantedUserCount$.value - 1);
    }
  }

  async updateUserRole(userId: string, role: DocRole) {
    const res = await this.store.updateDocUserRole(
      this.workspaceService.workspace.id,
      this.docService.doc.id,
      userId,
      role
    );
    if (res) {
      if (role === DocRole.Owner) {
        this.reset();
        this.loadMore();
        return res;
      }
      this.grantedUsers$.next(
        this.grantedUsers$.value.map(user => {
          if (user.user.id === userId) {
            return { ...user, role };
          }
          return user;
        })
      );
    }

    return res;
  }

  async updateDocDefaultRole(role: DocRole) {
    return await this.store.updateDocDefaultRole({
      docId: this.docService.doc.id,
      workspaceId: this.workspaceService.workspace.id,
      role,
    });
  }

  override dispose(): void {
    this.loadMore.unsubscribe();
  }
}
