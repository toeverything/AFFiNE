export { AppThemeService } from './services/theme';

import { type Framework } from '@toeverything/infra';

import { EditorSettingService } from '../editor-setting';
import { WorkspaceScope } from '../workspace';
import { AppTheme } from './entities/theme';
import { EdgelessThemeService } from './services/edgeless-theme';
import { AppThemeService } from './services/theme';

export function configureAppThemeModule(framework: Framework) {
  framework
    .service(AppThemeService)
    .entity(AppTheme)
    .scope(WorkspaceScope)
    .service(EdgelessThemeService, [AppThemeService, EditorSettingService]);
}

export function configureEssentialThemeModule(framework: Framework) {
  framework.service(AppThemeService).entity(AppTheme);
}
