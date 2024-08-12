import { type Framework, GlobalState } from '@toeverything/infra';

import { ThemeEditorService } from './services/theme-editor';

export { CustomThemeModifier, useCustomTheme } from './views/custom-theme';
export { ThemeEditor } from './views/theme-editor';
export { ThemeEditorService };

export function configureThemeEditorModule(framework: Framework) {
  framework.service(ThemeEditorService, [GlobalState]);
}
