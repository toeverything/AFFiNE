import { Service } from '../../../framework';
import { WorkspaceList } from '../entities/list';

export class WorkspaceListService extends Service {
  list = this.framework.createEntity(WorkspaceList);
}
