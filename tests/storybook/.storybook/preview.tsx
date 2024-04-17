import './polyfill';
import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import '@affine/core/bootstrap/preload';
import { createI18n } from '@affine/i18n';
import { ThemeProvider, useTheme } from 'next-themes';
import { useDarkMode } from 'storybook-dark-mode';
import { AffineContext } from '@affine/component/context';
import useSWR from 'swr';
import type { Decorator } from '@storybook/react';
import {
  FrameworkRoot,
  FrameworkScope,
  GlobalContextService,
  LifecycleService,
  WorkspacesService,
  _setCurrentStore,
  configureTestingInfraModules,
  useLiveData,
} from '@toeverything/infra';
import { setupGlobal, type Environment } from '@affine/env/global';

import type { Preview } from '@storybook/react';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Framework } from '@toeverything/infra';
import { configureCommonModules } from '@affine/core/modules';
import { createStore } from 'jotai';

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
window.localStorage.setItem('app_config', '{"onBoarding":false}');
window.localStorage.setItem('dismissAiOnboarding', 'true');
window.localStorage.setItem('dismissAiOnboardingEdgeless', 'true');
window.localStorage.setItem('dismissAiOnboardingLocal', 'true');

const framework = new Framework();

configureCommonModules(framework);
configureTestingInfraModules(framework);

const frameworkProvider = framework.provider();

frameworkProvider.get(LifecycleService).applicationStart();
const globalContextService = frameworkProvider.get(GlobalContextService);

const store = createStore();
_setCurrentStore(store);

frameworkProvider
  .get(WorkspacesService)
  .create(WorkspaceFlavour.LOCAL, async w => {
    w.meta.setName('test-workspace');
    w.meta.writeVersion(w);
  })
  .then(meta => {
    globalContextService.globalContext.workspaceId.set(meta.id);
  });

const withContextDecorator: Decorator = (Story, context) => {
  const workspaceId = useLiveData(
    globalContextService.globalContext.workspaceId.$
  );

  const { workspace } =
    useMemo(() => {
      if (!workspaceId) {
        return null;
      }
      return frameworkProvider.get(WorkspacesService).open({
        metadata: { flavour: WorkspaceFlavour.LOCAL, id: workspaceId },
      });
    }, []) ?? {};

  if (!workspace) {
    return <>loading..</>;
  }

  return (
    <FrameworkRoot framework={frameworkProvider}>
      <FrameworkScope scope={workspace.scope}>
        <ThemeProvider>
          <AffineContext store={store}>
            <ThemeChange />
            <Story {...context} />
          </AffineContext>
        </ThemeProvider>
      </FrameworkScope>
    </FrameworkRoot>
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
