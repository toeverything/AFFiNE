import { Service } from '@toeverything/infra';

import type { WorkspaceMetadata } from '..';
import type { WorkspaceDestroyService } from './destroy';
import type { WorkspaceFactoryService } from './factory';
import type { WorkspaceFlavoursService } from './flavours';
import type { WorkspaceListService } from './list';
import type { WorkspaceProfileService } from './profile';
import type { WorkspaceRepositoryService } from './repo';
import type { WorkspaceTransformService } from './transform';

export class WorkspacesService extends Service {
  get list() {
    return this.listService.list;
  }

  constructor(
    private readonly flavoursService: WorkspaceFlavoursService,
    private readonly listService: WorkspaceListService,
    private readonly profileRepo: WorkspaceProfileService,
    private readonly transform: WorkspaceTransformService,
    private readonly workspaceRepo: WorkspaceRepositoryService,
    private readonly workspaceFactory: WorkspaceFactoryService,
    private readonly destroy: WorkspaceDestroyService
  ) {
    super();
  }

  get deleteWorkspace() {
    return this.destroy.deleteWorkspace;
  }

  get getProfile() {
    return this.profileRepo.getProfile;
  }

  get transformLocalToCloud() {
    return this.transform.transformLocalToCloud;
  }

  get open() {
    return this.workspaceRepo.open;
  }

  get openByWorkspaceId() {
    return this.workspaceRepo.openByWorkspaceId;
  }

  get create() {
    return this.workspaceFactory.create;
  }

  async getWorkspaceBlob(meta: WorkspaceMetadata, blob: string) {
    return await this.flavoursService.flavours$.value
      .find(x => x.flavour === meta.flavour)
      ?.getWorkspaceBlob(meta.id, blob);
  }

  getWorkspaceFlavourProvider(meta: WorkspaceMetadata) {
    return this.flavoursService.flavours$.value.find(
      x => x.flavour === meta.flavour
    );
  }
}
