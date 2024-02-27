import type {
  GlobalState,
  Workspace,
  WorkspaceLocalState,
} from '@toeverything/infra';

export class WorkspaceLocalStateImpl implements WorkspaceLocalState {
  constructor(
    private readonly workspace: Workspace,
    private readonly globalState: GlobalState
  ) {}

  get<T>(key: string): T | null {
    return this.globalState.get<T>(
      `workspace-state:${this.workspace.id}:${key}`
    );
  }

  watch<T>(key: string) {
    return this.globalState.watch<T>(
      `workspace-state:${this.workspace.id}:${key}`
    );
  }

  set<T>(key: string, value: T | null): void {
    return this.globalState.set<T>(
      `workspace-state:${this.workspace.id}:${key}`,
      value
    );
  }
}
