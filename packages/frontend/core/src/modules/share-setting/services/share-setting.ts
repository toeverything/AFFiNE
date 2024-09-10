import { Service } from '@toeverything/infra';

import { WorkspaceShareSetting } from '../entities/share-setting';

export class WorkspaceShareSettingService extends Service {
  sharePreview = this.framework.createEntity(WorkspaceShareSetting);
}
