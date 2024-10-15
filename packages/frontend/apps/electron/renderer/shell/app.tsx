import { ThemeProvider } from '@affine/component/theme-provider';
import { ShellAppFallback } from '@affine/core/components/affine/app-container';
import { useAppSettingHelper } from '@affine/core/components/hooks/affine/use-app-setting-helper';
import { configureAppSidebarModule } from '@affine/core/modules/app-sidebar';
import {
  AppTabsHeader,
  configureAppTabsHeaderModule,
} from '@affine/core/modules/app-tabs-header';
import { configureI18nModule, I18nProvider } from '@affine/core/modules/i18n';
import { configureElectronStateStorageImpls } from '@affine/core/modules/storage';
import { SplitViewFallback } from '@affine/core/modules/workbench/view/split-view/split-view';
import {
  configureGlobalStorageModule,
  Framework,
  FrameworkRoot,
} from '@toeverything/infra';

import * as styles from './app.css';

const framework = new Framework();
configureGlobalStorageModule(framework);
configureElectronStateStorageImpls(framework);
configureAppTabsHeaderModule(framework);
configureAppSidebarModule(framework);
configureI18nModule(framework);
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
            <ShellAppFallback className={styles.fallbackRoot}>
              <SplitViewFallback className={styles.splitViewFallback} />
            </ShellAppFallback>
          </div>
        </I18nProvider>
      </ThemeProvider>
    </FrameworkRoot>
  );
}
