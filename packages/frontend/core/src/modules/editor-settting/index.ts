import { type Framework, GlobalState } from '@toeverything/infra';

import { UserDBService } from '../userspace';
import { EditorSetting } from './entities/editor-setting';
import { CurrentUserDBEditorSettingProvider } from './impls/user-db';
import { EditorSettingProvider } from './provider/editor-setting-provider';
import { EditorSettingService } from './services/editor-setting';
export type { FontFamily } from './schema';
export { EditorSettingSchema, fontStyleOptions } from './schema';
export { EditorSettingService } from './services/editor-setting';

export function configureEditorSettingModule(framework: Framework) {
  framework
    .service(EditorSettingService)
    .entity(EditorSetting, [EditorSettingProvider])
    .impl(EditorSettingProvider, CurrentUserDBEditorSettingProvider, [
      UserDBService,
      GlobalState,
    ]);
}
