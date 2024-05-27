import { Service } from '../../../framework';
import { WorkspaceEngine } from '../entities/engine';
import type { WorkspaceScope } from '../scopes/workspace';

export class WorkspaceEngineService extends Service {
  private _engine: WorkspaceEngine | null = null;
  get engine() {
    if (!this._engine) {
      this._engine = this.framework.createEntity(WorkspaceEngine, {
        engineProvider:
          this.workspaceScope.props.flavourProvider.getEngineProvider(
            this.workspaceScope.props.openOptions.metadata.id
          ),
      });
    }
    return this._engine;
  }

  constructor(private readonly workspaceScope: WorkspaceScope) {
    super();
  }
}
