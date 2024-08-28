import { type Framework, GlobalState } from '@toeverything/infra';

import { EditorSetting } from './entities/editor-setting';
import { GlobalStateEditorSettingProvider } from './impls/global-state';
import { EditorSettingProvider } from './provider/editor-setting-provider';
import { EditorSettingService } from './services/editor-setting';
export type { FontFamily } from './schema';
export { EditorSettingSchema, fontStyleOptions } from './schema';
export { EditorSettingService } from './services/editor-setting';

export function configureEditorSettingModule(framework: Framework) {
  framework
    .service(EditorSettingService)
    .entity(EditorSetting, [EditorSettingProvider])
    .impl(EditorSettingProvider, GlobalStateEditorSettingProvider, [
      GlobalState,
    ]);
}
