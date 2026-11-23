import type { License } from '@affine/graphql';
import {
  catchErrorInto,
  effect,
  exhaustMapWithTrailing,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  Service,
  smartRetry,
} from '@toeverything/infra';
import { tap } from 'rxjs';

import type { WorkspaceService } from '../../workspace';
import type { SelfhostLicenseStore } from '../stores/selfhost-license';

export class SelfhostLicenseService extends Service {
  constructor(
    private readonly store: SelfhostLicenseStore,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }
  license$ = new LiveData<License | null>(null);
  isRevalidating$ = new LiveData(false);
  error$ = new LiveData<any | null>(null);

  revalidate = effect(
    exhaustMapWithTrailing(() => {
      return fromPromise(async signal => {
        const currentWorkspaceId = this.workspaceService.workspace.id;
        if (!currentWorkspaceId) {
          return undefined; // no subscription if no user
        }
        return await this.store.getLicense(currentWorkspaceId, signal);
      }).pipe(
        smartRetry(),
        tap(data => {
          if (data) {
            this.license$.next(data);
          }
        }),
        catchErrorInto(this.error$),
        onStart(() => this.isRevalidating$.next(true)),
        onComplete(() => this.isRevalidating$.next(false))
      );
    })
  );

  async activateLicense(workspaceId: string, licenseKey: string) {
    return await this.store.activate(workspaceId, licenseKey);
  }

  async deactivateLicense(workspaceId: string) {
    return await this.store.deactivate(workspaceId);
  }

  async installLicense(workspaceId: string, licenseFile: File) {
    return await this.store.installLicense(workspaceId, licenseFile);
  }

  clear() {
    this.license$.next(null);
    this.error$.next(null);
  }
}
