import { type Framework, GlobalState } from '@toeverything/infra';

import { ThemeEditorService } from './services/theme-editor';

export { ThemeEditorService };

export function configureThemeEditorModule(framework: Framework) {
  framework.service(ThemeEditorService, [GlobalState]);
}
