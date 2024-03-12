import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import { createI18n } from '@affine/i18n';
import { ThemeProvider, useTheme } from 'next-themes';
import { useDarkMode } from 'storybook-dark-mode';
import { AffineContext } from '@affine/component/context';
import useSWR from 'swr';
import type { Decorator } from '@storybook/react';
import { _setCurrentStore } from '@toeverything/infra/atom';
import { setupGlobal, type Environment } from '@affine/env/global';

import type { Preview } from '@storybook/react';
import { useLayoutEffect, useRef } from 'react';
import { setup } from '@affine/core/bootstrap/setup';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { ServiceCollection } from '@toeverything/infra/di';
import {
  WorkspaceManager,
  configureInfraServices,
  configureTestingInfraServices,
} from '@toeverything/infra';
import { CurrentWorkspaceService } from '@affine/core/modules/workspace';
import { configureBusinessServices } from '@affine/core/modules/services';
import { createStore } from 'jotai';
import { GlobalScopeProvider } from '@affine/core/modules/infra-web/global-scope';

setupGlobal();
export const parameters = {
  backgrounds: { disable: true },
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

const i18n = createI18n();
const withI18n: Decorator = (Story, context) => {
  const locale = context.globals.locale;
  useSWR(
    locale,
    async () => {
      await i18n.changeLanguage(locale);
    },
    {
      suspense: true,
    }
  );
  return <Story {...context} />;
};

const ThemeChange = () => {
  const isDark = useDarkMode();
  const theme = useTheme();
  if (theme.resolvedTheme === 'dark' && !isDark) {
    theme.setTheme('light');
  } else if (theme.resolvedTheme === 'light' && isDark) {
    theme.setTheme('dark');
  }
  return null;
};

localStorage.clear();

// do not show onboarding for storybook
window.localStorage.setItem(
  'app_config',
  '{"onBoarding":false, "dismissWorkspaceGuideModal":true}'
);

const services = new ServiceCollection();

configureInfraServices(services);
configureTestingInfraServices(services);
configureBusinessServices(services);

const provider = services.provider();

const store = createStore();
_setCurrentStore(store);
setup();

provider
  .get(WorkspaceManager)
  .createWorkspace(WorkspaceFlavour.LOCAL, async w => {
    w.meta.setName('test-workspace');
    w.meta.writeVersion(w);
  })
  .then(workspaceMetadata => {
    const currentWorkspace = provider.get(CurrentWorkspaceService);
    const workspaceManager = provider.get(WorkspaceManager);
    currentWorkspace.openWorkspace(
      workspaceManager.open(workspaceMetadata).workspace
    );
  });

const withContextDecorator: Decorator = (Story, context) => {
  return (
    <GlobalScopeProvider provider={provider}>
      <ThemeProvider>
        <AffineContext store={store}>
          <ThemeChange />
          <Story {...context} />
        </AffineContext>
      </ThemeProvider>
    </GlobalScopeProvider>
  );
};

const platforms = ['web', 'desktop-macos', 'desktop-windows'] as const;

const withPlatformSelectionDecorator: Decorator = (Story, context) => {
  const setupCounterRef = useRef(0);
  useLayoutEffect(() => {
    if (setupCounterRef.current++ === 0) {
      return;
    }
    switch (context.globals.platform) {
      case 'desktop-macos':
        environment = {
          ...environment,
          isBrowser: true,
          isDesktop: true,
          isMacOs: true,
          isWindows: false,
        } as Environment;
        break;
      case 'desktop-windows':
        environment = {
          ...environment,
          isBrowser: true,
          isDesktop: true,
          isMacOs: false,
          isWindows: true,
        } as Environment;
        break;
      default:
        globalThis.$AFFINE_SETUP = false;
        setupGlobal();
        break;
    }
  }, [context.globals.platform]);

  return <Story key={context.globals.platform} {...context} />;
};

const decorators = [
  withContextDecorator,
  withI18n,
  withPlatformSelectionDecorator,
];

const preview: Preview = {
  decorators,
  globalTypes: {
    platform: {
      description: 'Rendering platform target',
      defaultValue: 'web',
      toolbar: {
        // The label to show for this toolbar item
        title: 'platform',
        // Array of plain string values or MenuItem shape (see below)
        items: platforms,
        // Change title based on selected value
        dynamicTitle: true,
      },
    },
  },
};

export default preview;
