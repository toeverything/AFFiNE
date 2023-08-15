import 'ses';
import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import '@toeverything/components/style.css';
import { createI18n } from '@affine/i18n';
import { ThemeProvider, useTheme } from 'next-themes';
import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { useDarkMode } from 'storybook-dark-mode';
import { setup } from '@affine/core/bootstrap/setup';
import { AffineContext } from '@affine/component/context';
import { use } from 'foxact/use';

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

const createI18nDecorator = () => {
  const i18n = createI18n();
  const withI18n = (Story: any, context: any) => {
    const locale = context.globals.locale;
    useEffect(() => {
      i18n.changeLanguage(locale);
    }, [locale]);
    return <Story {...context} />;
  };
  return withI18n;
};

const Component = () => {
  const isDark = useDarkMode();
  const theme = useTheme();
  useEffect(() => {
    theme.setTheme(isDark ? 'dark' : 'light');
  }, [isDark]);
  return null;
};

export const decorators = [
  (Story: ComponentType) => {
    use(setupPromise);
    return (
      <ThemeProvider>
        <AffineContext>
          <Component />
          <Story />
        </AffineContext>
      </ThemeProvider>
    );
  },
  createI18nDecorator(),
];
