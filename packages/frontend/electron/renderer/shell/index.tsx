import 'setimmediate';
import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import '@affine/core/bootstrap/preload';
import '../global.css';

import { ThemeProvider } from '@affine/component/theme-provider';
import { configureAppTabsHeaderModule } from '@affine/core/modules/app-tabs-header';
import { configureElectronStateStorageImpls } from '@affine/core/modules/storage';
import { performanceLogger } from '@affine/core/shared';
import { apis, events } from '@affine/electron-api';
import {
  configureGlobalStorageModule,
  Framework,
  FrameworkRoot,
} from '@toeverything/infra';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ShellRoot } from './shell';

const framework = new Framework();
configureGlobalStorageModule(framework);
configureElectronStateStorageImpls(framework);
configureAppTabsHeaderModule(framework);
const frameworkProvider = framework.provider();

const logger = performanceLogger.namespace('shell');

function main() {
  const handleMaximized = (maximized: boolean | undefined) => {
    document.documentElement.dataset.maximized = String(maximized);
  };
  const handleFullscreen = (fullscreen: boolean | undefined) => {
    document.documentElement.dataset.fullscreen = String(fullscreen);
  };

  apis?.ui.isMaximized().then(handleMaximized).catch(console.error);
  apis?.ui.isFullScreen().then(handleFullscreen).catch(console.error);
  events?.ui.onMaximized(handleMaximized);
  events?.ui.onFullScreen(handleFullscreen);
}

function mountApp() {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Root element not found');
  }
  logger.info('render app');
  createRoot(root).render(
    <StrictMode>
      <FrameworkRoot framework={frameworkProvider}>
        <ThemeProvider>
          <ShellRoot />
        </ThemeProvider>
      </FrameworkRoot>
    </StrictMode>
  );
}

try {
  main();
  mountApp();
} catch (err) {
  console.error('Failed to bootstrap app', err);
}
