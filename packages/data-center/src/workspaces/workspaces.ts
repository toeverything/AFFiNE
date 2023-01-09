import { Observable } from 'lib0/observable';
import type { WorkspaceInfo, WorkspaceMeta } from '../types';

export interface WorkspacesScope {
  get: (workspaceId: string) => WorkspaceInfo | undefined;
  list: () => WorkspaceInfo[];
  add: (workspace: WorkspaceInfo) => void;
  remove: (workspaceId: string) => boolean;
  clear: () => void;
  update: (workspaceId: string, workspaceMeta: Partial<WorkspaceMeta>) => void;
}

export interface WorkspacesChangeEvent {
  added?: WorkspaceInfo;
  deleted?: WorkspaceInfo;
  updated?: WorkspaceInfo;
}

export class Workspaces extends Observable<'change'> {
  private _workspacesMap = new Map<string, WorkspaceInfo>();

  get workspaces(): WorkspaceInfo[] {
    return Array.from(this._workspacesMap.values());
  }

  find(workspaceId: string) {
    return this._workspacesMap.get(workspaceId);
  }

  createScope(): WorkspacesScope {
    const scopedWorkspaceIds = new Set<string>();

    const get = (workspaceId: string) => {
      if (!scopedWorkspaceIds.has(workspaceId)) {
        return;
      }
      return this._workspacesMap.get(workspaceId);
    };

    const add = (workspace: WorkspaceInfo) => {
      if (this._workspacesMap.has(workspace.id)) {
        throw new Error(`Duplicate workspace id.`);
      }
      this._workspacesMap.set(workspace.id, workspace);
      scopedWorkspaceIds.add(workspace.id);

      this.emit('change', [
        {
          added: workspace,
        } as WorkspacesChangeEvent,
      ]);
    };

    const remove = (workspaceId: string) => {
      if (!scopedWorkspaceIds.has(workspaceId)) {
        return true;
      }

      const workspace = this._workspacesMap.get(workspaceId);
      if (workspace) {
        const ret = this._workspacesMap.delete(workspaceId);
        // If deletion failed, return.
        if (!ret) {
          return ret;
        }

        scopedWorkspaceIds.delete(workspaceId);

        this.emit('change', [
          {
            deleted: workspace,
          } as WorkspacesChangeEvent,
        ]);
      }
      return true;
    };

    const clear = () => {
      scopedWorkspaceIds.forEach(id => {
        remove(id);
      });
    };

    const update = (
      workspaceId: string,
      workspaceMeta: Partial<WorkspaceMeta>
    ) => {
      if (!scopedWorkspaceIds.has(workspaceId)) {
        return true;
      }

      const workspace = this._workspacesMap.get(workspaceId);
      if (!workspace) {
        return true;
      }

      this._workspacesMap.set(workspaceId, { ...workspace, ...workspaceMeta });

      this.emit('change', [
        {
          updated: this._workspacesMap.get(workspaceId),
        } as WorkspacesChangeEvent,
      ]);
    };

    // TODO: need to optimize
    const list = () => {
      const workspaces: WorkspaceInfo[] = [];
      scopedWorkspaceIds.forEach(id => {
        const workspace = this._workspacesMap.get(id);
        if (workspace) {
          workspaces.push(workspace);
        }
      });
      return workspaces;
    };

    return {
      get,
      list,
      add,
      remove,
      clear,
      update,
    };
  }
}
