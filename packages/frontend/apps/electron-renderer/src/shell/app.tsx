import { useAppSettingHelper } from '@affine/core/components/hooks/affine/use-app-setting-helper';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { ThemeProvider } from '@affine/core/components/theme-provider';
import { configureAppSidebarModule } from '@affine/core/modules/app-sidebar';
import { ShellAppSidebarFallback } from '@affine/core/modules/app-sidebar/views';
import {
  AppTabsHeader,
  configureAppTabsHeaderModule,
} from '@affine/core/modules/app-tabs-header';
import { configureDesktopApiModule } from '@affine/core/modules/desktop-api';
import { configureI18nModule, I18nProvider } from '@affine/core/modules/i18n';
import {
  configureElectronStateStorageImpls,
  configureStorageModule,
} from '@affine/core/modules/storage';
import { configureAppThemeModule } from '@affine/core/modules/theme';
import { Framework, FrameworkRoot } from '@toeverything/infra';

import * as styles from './app.css';

const framework = new Framework();
configureStorageModule(framework);
configureElectronStateStorageImpls(framework);
configureAppTabsHeaderModule(framework);
configureAppSidebarModule(framework);
configureI18nModule(framework);
configureDesktopApiModule(framework);
configureAppThemeModule(framework);
const frameworkProvider = framework.provider();

export function App() {
  const { appSettings } = useAppSettingHelper();
  const translucent =
    BUILD_CONFIG.isElectron &&
    environment.isMacOs &&
    appSettings.enableBlurBackground;
  return (
    <FrameworkRoot framework={frameworkProvider}>
      <ThemeProvider>
        <I18nProvider>
          <div className={styles.root} data-translucent={translucent}>
            <AppTabsHeader mode="shell" className={styles.appTabsHeader} />
            <div className={styles.body}>
              <ShellAppSidebarFallback />
            </div>
            {environment.isWindows && (
              <div style={{ position: 'fixed', right: 0, top: 0, zIndex: 5 }}>
                <WindowsAppControls />
              </div>
            )}
          </div>
        </I18nProvider>
      </ThemeProvider>
    </FrameworkRoot>
  );
}
