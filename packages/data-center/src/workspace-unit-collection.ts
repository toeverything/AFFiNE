import { Observable } from 'lib0/observable';
import type {
  WorkspaceUnit,
  UpdateWorkspaceUnitParams,
} from './workspace-unit';

export interface WorkspaceUnitCollectionScope {
  get: (workspaceId: string) => WorkspaceUnit | undefined;
  list: () => WorkspaceUnit[];
  add: (workspace: WorkspaceUnit | WorkspaceUnit[]) => void;
  remove: (workspaceId: string | string[]) => boolean;
  clear: () => void;
  update: (
    workspaceId: string,
    workspaceUnit: UpdateWorkspaceUnitParams
  ) => void;
}

export interface WorkspaceUnitCollectionChangeEvent {
  added?: WorkspaceUnit[];
  deleted?: WorkspaceUnit[];
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

    const add = (workspaceUnit: WorkspaceUnit | WorkspaceUnit[]) => {
      const workspaceUnits = Array.isArray(workspaceUnit)
        ? workspaceUnit
        : [workspaceUnit];
      let added = false;

      workspaceUnits.forEach(workspaceUnit => {
        if (this._workspaceUnitMap.has(workspaceUnit.id)) {
          // FIXME: multiple add same workspace
          return;
        }
        added = true;
        this._workspaceUnitMap.set(workspaceUnit.id, workspaceUnit);
        scopedWorkspaceIds.add(workspaceUnit.id);
      });

      if (!added) {
        return;
      }

      this._events.emit('change', [
        {
          added: workspaceUnits,
        } as WorkspaceUnitCollectionChangeEvent,
      ]);
    };

    const remove = (workspaceId: string | string[]) => {
      const workspaceIds = Array.isArray(workspaceId)
        ? workspaceId
        : [workspaceId];
      const workspaceUnits: WorkspaceUnit[] = [];

      workspaceIds.forEach(workspaceId => {
        if (!scopedWorkspaceIds.has(workspaceId)) {
          return;
        }
        const workspaceUnit = this._workspaceUnitMap.get(workspaceId);
        if (workspaceUnit) {
          const ret = this._workspaceUnitMap.delete(workspaceId);
          // If deletion failed, return.
          if (!ret) {
            return;
          }

          workspaceUnits.push(workspaceUnit);
          scopedWorkspaceIds.delete(workspaceId);
        }
      });

      if (!workspaceUnits.length) {
        return false;
      }

      this._events.emit('change', [
        {
          deleted: workspaceUnits,
        } as WorkspaceUnitCollectionChangeEvent,
      ]);

      return true;
    };

    const clear = () => {
      scopedWorkspaceIds.forEach(id => {
        remove(id);
      });
    };

    const update = (workspaceId: string, meta: UpdateWorkspaceUnitParams) => {
      if (!scopedWorkspaceIds.has(workspaceId)) {
        return true;
      }

      const workspaceUnit = this._workspaceUnitMap.get(workspaceId);
      if (!workspaceUnit) {
        return true;
      }

      workspaceUnit.update(meta);

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
