import { useEffect, ComponentType } from 'react';
import { ThemeProvider, useTheme } from 'next-themes';
import '@affine/component/theme/global.css';
import '@affine/component/theme/theme.css';
import { useDarkMode } from 'storybook-dark-mode';

export const parameters = {
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
    return (
      <ThemeProvider>
        <Component />
        <Story />
      </ThemeProvider>
    );
  },
];
