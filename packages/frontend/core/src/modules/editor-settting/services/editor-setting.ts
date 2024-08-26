import { Service } from '@toeverything/infra';

import { EditorSetting } from '../entities/editor-setting';

export class EditorSettingService extends Service {
  editorSetting = this.framework.createEntity(EditorSetting);
}
