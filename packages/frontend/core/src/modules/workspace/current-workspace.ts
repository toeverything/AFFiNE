import type { Workspace } from '@toeverything/infra';
import { LiveData } from '@toeverything/infra/livedata';

/**
 * service to manage current workspace
 */
export class CurrentWorkspaceService {
  currentWorkspace = new LiveData<Workspace | null>(null);

  /**
   * open workspace, current workspace will be set to the workspace
   * @param workspace
   */
  openWorkspace(workspace: Workspace) {
    this.currentWorkspace.next(workspace);
  }

  /**
   * close current workspace, current workspace will be null
   */
  closeWorkspace() {
    this.currentWorkspace.next(null);
  }
}
