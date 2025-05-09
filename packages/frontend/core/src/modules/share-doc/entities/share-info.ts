import type { GetWorkspacePageByIdQuery, PublicDocMode } from '@affine/graphql';
import {
  catchErrorInto,
  effect,
  Entity,
  fromPromise,
  LiveData,
  mapInto,
  onComplete,
  onStart,
  smartRetry,
} from '@toeverything/infra';
import { switchMap } from 'rxjs';

import type { DocService } from '../../doc';
import type { WorkspaceService } from '../../workspace';
import type { ShareStore } from '../stores/share';

type ShareInfoType = GetWorkspacePageByIdQuery['workspace']['doc'];

export class ShareInfo extends Entity {
  info$ = new LiveData<ShareInfoType | undefined | null>(null);
  isShared$ = this.info$.map(info => info?.public);
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
        smartRetry(),
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

  async enableShare(mode: PublicDocMode) {
    await this.store.enableSharePage(
      this.workspaceService.workspace.id,
      this.docService.doc.id,
      mode
    );
    await this.waitForRevalidation();
  }

  async changeShare(mode: PublicDocMode) {
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
