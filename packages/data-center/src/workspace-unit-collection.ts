import { Observable } from 'lib0/observable';
import { WorkspaceUnit } from './workspace-unit.js';
import type {
  WorkspaceUnitCtorParams,
  UpdateWorkspaceUnitParams,
} from './workspace-unit';

export interface WorkspaceUnitCollectionScope {
  get: (workspaceId: string) => WorkspaceUnit | undefined;
  list: () => WorkspaceUnit[];
  add: (workspace: WorkspaceUnitCtorParams) => void;
  remove: (workspaceId: string) => boolean;
  clear: () => void;
  update: (
    workspaceId: string,
    workspaceMeta: UpdateWorkspaceUnitParams
  ) => void;
}

export interface WorkspaceUnitCollectionChangeEvent {
  added?: WorkspaceUnit[];
  deleted?: WorkspaceUnit;
  updated?: WorkspaceUnit;
}

export class WorkspaceUnitCollection {
  private _events = new Observable();
  private _workspaceUnitMap = new Map<string, WorkspaceUnit>();

  get workspaces(): WorkspaceUnit[] {
    return Array.from(this._workspaceUnitMap.values());
  }

  public on(
    type: 'change',
    callback: (event: WorkspaceUnitCollectionChangeEvent) => void
  ) {
    this._events.on(type, callback);
  }

  public once(
    type: 'change',
    callback: (event: WorkspaceUnitCollectionChangeEvent) => void
  ) {
    this._events.once(type, callback);
  }

  find(workspaceId: string) {
    return this._workspaceUnitMap.get(workspaceId);
  }

  createScope(): WorkspaceUnitCollectionScope {
    const scopedWorkspaceIds = new Set<string>();

    const get = (workspaceId: string) => {
      if (!scopedWorkspaceIds.has(workspaceId)) {
        return;
      }
      return this._workspaceUnitMap.get(workspaceId);
    };

    const add = (workspace: WorkspaceUnitCtorParams) => {
      if (this._workspaceUnitMap.has(workspace.id)) {
        throw new Error(`Duplicate workspace id.`);
      }

      const workspaceUnit = new WorkspaceUnit(workspace);
      this._workspaceUnitMap.set(workspace.id, workspaceUnit);

      scopedWorkspaceIds.add(workspace.id);

      this._events.emit('change', [
        {
          added: [workspaceUnit],
        } as WorkspaceUnitCollectionChangeEvent,
      ]);
    };

    const remove = (workspaceId: string) => {
      if (!scopedWorkspaceIds.has(workspaceId)) {
        return true;
      }

      const workspaceUnit = this._workspaceUnitMap.get(workspaceId);
      if (workspaceUnit) {
        const ret = this._workspaceUnitMap.delete(workspaceId);
        // If deletion failed, return.
        if (!ret) {
          return ret;
        }

        scopedWorkspaceIds.delete(workspaceId);

        this._events.emit('change', [
          {
            deleted: workspaceUnit,
          } as WorkspaceUnitCollectionChangeEvent,
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
      workspaceMeta: UpdateWorkspaceUnitParams
    ) => {
      if (!scopedWorkspaceIds.has(workspaceId)) {
        return true;
      }

      const workspaceUnit = this._workspaceUnitMap.get(workspaceId);
      if (!workspaceUnit) {
        return true;
      }

      workspaceUnit.update(workspaceMeta);

      this._events.emit('change', [
        {
          updated: workspaceUnit,
        } as WorkspaceUnitCollectionChangeEvent,
      ]);
    };

    // TODO: need to optimize
    const list = () => {
      const workspaceUnits: WorkspaceUnit[] = [];
      scopedWorkspaceIds.forEach(id => {
        const workspaceUnit = this._workspaceUnitMap.get(id);
        if (workspaceUnit) {
          workspaceUnits.push(workspaceUnit);
        }
      });
      return workspaceUnits;
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
