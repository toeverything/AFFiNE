import 'ses';
import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import '@toeverything/components/style.css';
import { createI18n } from '@affine/i18n';
import { ThemeProvider, useTheme } from 'next-themes';
import { useDarkMode } from 'storybook-dark-mode';
import { setup } from '@affine/core/bootstrap/setup';
import { AffineContext } from '@affine/component/context';
import { use } from 'foxact/use';
import useSWR from 'swr';
import type { Decorator } from '@storybook/react';

const setupPromise = setup();

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

const withContextDecorator: Decorator = (Story, context) => {
  use(setupPromise);
  return (
    <ThemeProvider>
      <AffineContext>
        <ThemeChange />
        <Story {...context} />
      </AffineContext>
    </ThemeProvider>
  );
};

export const decorators = [withContextDecorator, withI18n];
