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

import type { WorkspaceService } from '../../workspace';
import type { Member } from '../entities/members';
import type { MemberSearchStore } from '../stores/member-search';

export class MemberSearchService extends Service {
  constructor(
    private readonly store: MemberSearchStore,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  readonly PAGE_SIZE = 8;
  readonly searchText$ = new LiveData<string>('');
  readonly isLoading$ = new LiveData(false);
  readonly error$ = new LiveData<any>(null);
  readonly result$ = new LiveData<Member[]>([]);
  readonly hasMore$ = new LiveData(true);

  readonly loadMore = effect(
    exhaustMap(() => {
      if (!this.hasMore$.value) {
        return EMPTY;
      }
      return fromPromise(async signal => {
        return this.store.getMembersByEmailOrName(
          this.workspaceService.workspace.id,
          this.searchText$.value || undefined,
          this.result$.value.length,
          this.PAGE_SIZE,
          signal
        );
      }).pipe(
        tap(data => {
          this.result$.setValue([...this.result$.value, ...data.members]);
          this.hasMore$.setValue(data.members.length === this.PAGE_SIZE);
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
    this.result$.setValue([]);
    this.hasMore$.setValue(true);
    this.searchText$.setValue('');
    this.error$.setValue(null);
    this.loadMore.reset();
  }

  search(searchText?: string) {
    this.reset();
    this.searchText$.setValue(searchText ?? '');
    this.loadMore();
  }
}
