import { ThemeProvider } from '@affine/component/theme-provider';
import { useAppSettingHelper } from '@affine/core/components/hooks/affine/use-app-setting-helper';
import { configureAppSidebarModule } from '@affine/core/modules/app-sidebar';
import { ShellAppSidebarFallback } from '@affine/core/modules/app-sidebar/views';
import {
  AppTabsHeader,
  configureAppTabsHeaderModule,
} from '@affine/core/modules/app-tabs-header';
import { configureI18nModule, I18nProvider } from '@affine/core/modules/i18n';
import { configureElectronStateStorageImpls } from '@affine/core/modules/storage';
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
            <div className={styles.body}>
              <ShellAppSidebarFallback />
            </div>
          </div>
        </I18nProvider>
      </ThemeProvider>
    </FrameworkRoot>
  );
}

// const AppContainer = ({
//   children,
//   className,
//   ...rest
// }: PropsWithChildren<{
//   className?: string;
//   fallback?: boolean;
//   shell?: boolean;
// }>) => {
//   const { appSettings } = useAppSettingHelper();

//   const noisyBackground =
//     BUILD_CONFIG.isElectron && appSettings.enableNoisyBackground;
//   const blurBackground =
//     BUILD_CONFIG.isElectron &&
//     environment.isMacOs &&
//     appSettings.enableBlurBackground;
//   return (
//     <div
//       {...rest}
//       className={clsx(styles.appStyle, className, {
//         'noisy-background': noisyBackground,
//         'blur-background': blurBackground,
//       })}
//       data-noise-background={noisyBackground}
//       data-blur-background={blurBackground}
//     >
//       {children}
//     </div>
//   );
// };
