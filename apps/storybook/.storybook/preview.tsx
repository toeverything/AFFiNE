import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import { LOCALES, createI18n } from '@affine/i18n';
import { ThemeProvider, useTheme } from 'next-themes';
import { setupGlobal } from '@affine/env/global';
import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { useDarkMode } from 'storybook-dark-mode';

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

export const globalTypes = {
  locale: {
    name: 'Locale',
    description: 'Internationalization locale',
    defaultValue: 'en',
    toolbar: {
      icon: 'globe',
      items: LOCALES.map(locale => ({
        title: locale.originalName,
        value: locale.tag,
        right: locale.flagEmoji,
      })),
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
    return (
      <ThemeProvider>
        <Component />
        <Story />
      </ThemeProvider>
    );
  },
  createI18nDecorator(),
];
