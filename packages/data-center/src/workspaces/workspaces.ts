import { Observable } from 'lib0/observable';
import type { Workspace, WorkspaceMeta } from '../types';

export interface WorkspacesScope {
  get: (workspaceId: string) => Workspace | undefined;
  list: () => Workspace[];
  add: (workspace: Workspace) => void;
  remove: (workspaceId: string) => boolean;
  clear: () => void;
  update: (workspaceId: string, workspaceMeta: Partial<WorkspaceMeta>) => void;
}

export interface WorkspacesChangeEvent {
  added?: Workspace;
  deleted?: Workspace;
  updated?: Workspace;
}

export class Workspaces extends Observable<'change'> {
  private _workspacesMap = new Map<string, Workspace>();

  get workspaces(): Workspace[] {
    return Object.values(this._workspacesMap);
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

    const add = (workspace: Workspace) => {
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
      const workspaces: Workspace[] = [];
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
