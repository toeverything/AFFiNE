import type { WorkspaceMemberStatus } from '@affine/graphql';
import type {
  RealtimeTopicEventOf,
  WorkspaceMemberSnapshot,
} from '@affine/realtime';
import { Entity, LiveData } from '@toeverything/infra';

import { RealtimeLiveQuery } from '../../cloud/realtime/live-query';
import type { WorkspaceService } from '../../workspace';
import type { WorkspaceMembersStore } from '../stores/members';

export type Member = Omit<
  WorkspaceMemberSnapshot,
  'permission' | 'role' | 'status'
> & {
  permission: string;
  role: string;
  status: WorkspaceMemberStatus;
};

export class WorkspaceMembers extends Entity {
  constructor(
    private readonly store: WorkspaceMembersStore,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
    this.liveQuery.start();
  }

  pageNum$ = new LiveData(0);
  memberCount$ = new LiveData<number | undefined>(undefined);
  pageMembers$ = new LiveData<Member[] | undefined>(undefined);

  isLoading$ = new LiveData(false);
  error$ = new LiveData<any>(null);

  readonly PAGE_SIZE = 8;

  private readonly liveQuery = new RealtimeLiveQuery<
    { members: Member[]; memberCount: number },
    RealtimeTopicEventOf<'workspace.members.changed'>
  >({
    request: signal => this.requestMembers(signal),
    subscribe: () =>
      this.store.subscribeMembers(this.workspaceService.workspace.id),
    applySnapshot: data => {
      this.error$.next(null);
      this.memberCount$.setValue(data.memberCount);
      this.pageMembers$.setValue(data.members);
    },
    applyEvent: () => 'revalidate',
    onError: error => this.error$.setValue(error),
  });

  revalidate = () => {
    this.liveQuery.revalidate();
  };

  setPageNum(pageNum: number) {
    this.pageNum$.setValue(pageNum);
    this.revalidate();
  }

  override dispose(): void {
    this.liveQuery.dispose();
  }

  private async requestMembers(signal: AbortSignal) {
    this.isLoading$.setValue(true);
    this.error$.setValue(null);
    this.pageMembers$.setValue(undefined);
    try {
      const pageNum = this.pageNum$.value;
      return await this.store.fetchMembers(
        this.workspaceService.workspace.id,
        pageNum * this.PAGE_SIZE,
        this.PAGE_SIZE,
        signal
      );
    } finally {
      this.isLoading$.setValue(false);
    }
  }
}
