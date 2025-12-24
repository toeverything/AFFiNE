import { configureElectronStateStorageImpls } from '@affine/core/desktop/storage';
import { configureCommonModules } from '@affine/core/modules';
import { configureAppTabsHeaderModule } from '@affine/core/modules/app-tabs-header';
import { configureDesktopBackupModule } from '@affine/core/modules/backup';
import { ValidatorProvider } from '@affine/core/modules/cloud';
import {
  configureDesktopApiModule,
  DesktopApiService,
} from '@affine/core/modules/desktop-api';
import {
  configureSpellCheckSettingModule,
  configureTraySettingModule,
} from '@affine/core/modules/editor-setting';
import { configureFindInPageModule } from '@affine/core/modules/find-in-page';
import {
  ClientSchemeProvider,
  PopupWindowProvider,
} from '@affine/core/modules/url';
import { configureDesktopWorkbenchModule } from '@affine/core/modules/workbench';
import { configureBrowserWorkspaceFlavours } from '@affine/core/modules/workspace-engine';
import { Framework } from '@toeverything/infra';

export function setupModules() {
  const framework = new Framework();
  configureCommonModules(framework);
  configureElectronStateStorageImpls(framework);
  configureBrowserWorkspaceFlavours(framework);
  configureDesktopWorkbenchModule(framework);
  configureAppTabsHeaderModule(framework);
  configureFindInPageModule(framework);
  configureDesktopApiModule(framework);
  configureSpellCheckSettingModule(framework);
  configureTraySettingModule(framework);
  configureDesktopBackupModule(framework);

  framework.impl(PopupWindowProvider, p => {
    const apis = p.get(DesktopApiService).api;
    return {
      open: (url: string) => {
        apis.handler.ui.openExternal(url).catch(e => {
          console.error('Failed to open external URL', e);
        });
      },
    };
  });
  framework.impl(ClientSchemeProvider, p => {
    const appInfo = p.get(DesktopApiService).appInfo;
    return {
      getClientScheme() {
        return appInfo?.scheme;
      },
    };
  });
  framework.impl(ValidatorProvider, p => {
    const apis = p.get(DesktopApiService).api;
    return {
      async validate(_challenge, resource) {
        const token = await apis.handler.ui.getChallengeResponse(resource);
        if (!token) {
          throw new Error('Challenge failed');
        }
        return token;
      },
    };
  });

  const frameworkProvider = framework.provider();

  return { framework, frameworkProvider };
}
