import 'ses';
import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import '@toeverything/components/style.css';
import { createI18n } from '@affine/i18n';
import { ThemeProvider, useTheme } from 'next-themes';
import { useDarkMode } from 'storybook-dark-mode';
import { AffineContext } from '@affine/component/context';
import useSWR from 'swr';
import type { Decorator } from '@storybook/react';
import { createStore } from 'jotai/vanilla';
import { setup } from '@affine/core/bootstrap/setup';
import { _setCurrentStore } from '@toeverything/infra/atom';
import { bootstrapPluginSystem } from '@affine/core/bootstrap/register-plugins';
import { setupGlobal } from '@affine/env/global';

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

const storeMap = new Map<string, ReturnType<typeof createStore>>();

const withContextDecorator: Decorator = (Story, context) => {
  const { data: store } = useSWR(
    context.id,
    async () => {
      if (storeMap.has(context.id)) {
        return storeMap.get(context.id);
      }
      localStorage.clear();
      const store = createStore();
      _setCurrentStore(store);
      await setup(store);
      await bootstrapPluginSystem(store);
      storeMap.set(context.id, store);
      return store;
    },
    {
      suspense: true,
    }
  );
  return (
    <ThemeProvider>
      <AffineContext store={store}>
        <ThemeChange />
        <Story {...context} />
      </AffineContext>
    </ThemeProvider>
  );
};

export const decorators = [withContextDecorator, withI18n];
