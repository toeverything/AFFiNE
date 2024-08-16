import type {
  GetWorkspacePublicPageByIdQuery,
  PublicPageMode,
} from '@affine/graphql';
import type { DocService, WorkspaceService } from '@toeverything/infra';
import {
  backoffRetry,
  catchErrorInto,
  effect,
  Entity,
  fromPromise,
  LiveData,
  mapInto,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { switchMap } from 'rxjs';

import { isBackendError, isNetworkError } from '../../cloud';
import type { ShareStore } from '../stores/share';

type ShareInfoType = GetWorkspacePublicPageByIdQuery['workspace']['publicPage'];

export class ShareInfo extends Entity {
  info$ = new LiveData<ShareInfoType | undefined | null>(null);
  isShared$ = this.info$.map(info =>
    // null means not loaded yet, undefined means not shared
    info !== null ? info !== undefined : null
  );
  sharedMode$ = this.info$.map(info => (info !== null ? info?.mode : null));

  error$ = new LiveData<any>(null);
  isRevalidating$ = new LiveData<boolean>(false);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly docService: DocService,
    private readonly store: ShareStore
  ) {
    super();
  }

  revalidate = effect(
    switchMap(() => {
      return fromPromise(signal =>
        this.store.getShareInfoByDocId(
          this.workspaceService.workspace.id,
          this.docService.doc.id,
          signal
        )
      ).pipe(
        backoffRetry({
          when: isNetworkError,
          count: Infinity,
        }),
        backoffRetry({
          when: isBackendError,
        }),
        mapInto(this.info$),
        catchErrorInto(this.error$),
        onStart(() => this.isRevalidating$.next(true)),
        onComplete(() => this.isRevalidating$.next(false))
      );
    })
  );

  waitForRevalidation(signal?: AbortSignal) {
    this.revalidate();
    return this.isRevalidating$.waitFor(v => v === false, signal);
  }

  async enableShare(mode: PublicPageMode) {
    await this.store.enableSharePage(
      this.workspaceService.workspace.id,
      this.docService.doc.id,
      mode
    );
    await this.waitForRevalidation();
  }

  async changeShare(mode: PublicPageMode) {
    await this.enableShare(mode);
  }

  async disableShare() {
    await this.store.disableSharePage(
      this.workspaceService.workspace.id,
      this.docService.doc.id
    );
    await this.waitForRevalidation();
  }
}
