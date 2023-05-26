import { useEffect, ComponentType, useMemo } from 'react';
import { ThemeProvider, useTheme } from 'next-themes';
import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import { useDarkMode } from 'storybook-dark-mode';
import { createI18n, I18nextProvider } from '@affine/i18n';

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
    const i18n = useMemo(() => createI18n(), []);
    return (
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          <Component />
          <Story />
        </ThemeProvider>
      </I18nextProvider>
    );
  },
];
