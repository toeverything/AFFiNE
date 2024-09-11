import { Service } from '../../../framework';
import { WorkspaceEngine } from '../entities/engine';
import type { WorkspaceScope } from '../scopes/workspace';

export class WorkspaceEngineService extends Service {
  private _engine: WorkspaceEngine | null = null;
  get engine() {
    if (!this._engine) {
      this._engine = this.framework.createEntity(WorkspaceEngine, {
        engineProvider: this.workspaceScope.props.engineProvider,
      });
    }
    return this._engine;
  }

  constructor(private readonly workspaceScope: WorkspaceScope) {
    super();
  }

  override dispose(): void {
    this._engine?.dispose();
    this._engine = null;
    super.dispose();
  }
}
