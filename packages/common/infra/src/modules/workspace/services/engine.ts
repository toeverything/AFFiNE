import { Service } from '../../../framework';
import { WorkspaceEngine } from '../entities/engine';
import type { WorkspaceService } from './workspace';

export class WorkspaceEngineService extends Service {
  private _engine: WorkspaceEngine | null = null;
  get engine() {
    if (!this._engine) {
      this._engine = this.framework.createEntity(WorkspaceEngine, {
        engineProvider:
          this.workspaceService.workspace.flavourProvider.getEngineProvider(
            this.workspaceService.workspace
          ),
      });
    }
    return this._engine;
  }

  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }
}
