import { type Memento, wrapMemento } from '../../../storage';
import type { GlobalCache, GlobalState } from '../../storage';
import type {
  WorkspaceLocalCache,
  WorkspaceLocalState,
} from '../providers/storage';
import type { WorkspaceService } from '../services/workspace';

export class WorkspaceLocalStateImpl implements WorkspaceLocalState {
  wrapped: Memento;
  constructor(workspaceService: WorkspaceService, globalState: GlobalState) {
    this.wrapped = wrapMemento(
      globalState,
      `workspace-state:${workspaceService.workspace.id}:`
    );
  }

  keys(): string[] {
    return this.wrapped.keys();
  }

  get<T>(key: string): T | undefined {
    return this.wrapped.get<T>(key);
  }

  watch<T>(key: string) {
    return this.wrapped.watch<T>(key);
  }

  set<T>(key: string, value: T): void {
    return this.wrapped.set<T>(key, value);
  }

  del(key: string): void {
    return this.wrapped.del(key);
  }

  clear(): void {
    return this.wrapped.clear();
  }
}

export class WorkspaceLocalCacheImpl implements WorkspaceLocalCache {
  wrapped: Memento;
  constructor(workspaceService: WorkspaceService, globalCache: GlobalCache) {
    this.wrapped = wrapMemento(
      globalCache,
      `workspace-cache:${workspaceService.workspace.id}:`
    );
  }

  keys(): string[] {
    return this.wrapped.keys();
  }

  get<T>(key: string): T | undefined {
    return this.wrapped.get<T>(key);
  }

  watch<T>(key: string) {
    return this.wrapped.watch<T>(key);
  }

  set<T>(key: string, value: T): void {
    return this.wrapped.set<T>(key, value);
  }

  del(key: string): void {
    return this.wrapped.del(key);
  }

  clear(): void {
    return this.wrapped.clear();
  }
}
