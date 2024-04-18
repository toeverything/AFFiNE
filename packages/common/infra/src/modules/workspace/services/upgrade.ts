import { Service } from '../../../framework';
import { WorkspaceUpgrade } from '../entities/upgrade';

export class WorkspaceUpgradeService extends Service {
  upgrade = this.framework.createEntity(WorkspaceUpgrade);
}
