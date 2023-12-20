import { DebugLogger } from '@affine/debug';
import { Unreachable } from '@affine/env/constant';

import type { Workspace } from './workspace';

const logger = new DebugLogger('affine:workspace-manager:pool');

/**
 * Collection of opened workspaces. use reference counting to manage active workspaces.
 */
export class WorkspacePool {
  openedWorkspaces = new Map<string, { workspace: Workspace; rc: number }>();
  timeoutToGc: NodeJS.Timeout | null = null;

  get(workspaceId: string): {
    workspace: Workspace;
    release: () => void;
  } | null {
    const exist = this.openedWorkspaces.get(workspaceId);
    if (exist) {
      exist.rc++;
      let released = false;
      return {
        workspace: exist.workspace,
        release: () => {
          // avoid double release
          if (released) {
            return;
          }
          released = true;
          exist.rc--;
          this.requestGc();
        },
      };
    }
    return null;
  }

  put(workspace: Workspace) {
    const ref = { workspace, rc: 0 };
    this.openedWorkspaces.set(workspace.meta.id, ref);

    const r = this.get(workspace.meta.id);
    if (!r) {
      throw new Unreachable();
    }

    return r;
  }

  private requestGc() {
    if (this.timeoutToGc) {
      clearInterval(this.timeoutToGc);
    }

    // do gc every 1s
    this.timeoutToGc = setInterval(() => {
      this.gc();
    }, 1000);
  }

  private gc() {
    for (const [id, { workspace, rc }] of new Map(
      this.openedWorkspaces /* clone the map, because the origin will be modified during iteration */
    )) {
      if (rc === 0 && workspace.canGracefulStop()) {
        // we can safely close the workspace
        logger.info(`close workspace [${workspace.flavour}] ${workspace.id}`);
        workspace.forceStop();

        this.openedWorkspaces.delete(id);
      }
    }

    for (const [_, { rc }] of this.openedWorkspaces) {
      if (rc === 0) {
        return;
      }
    }

    // if all workspaces has referrer, stop gc
    if (this.timeoutToGc) {
      clearInterval(this.timeoutToGc);
    }
  }
}
