import './polyfill';
import '../src/theme';
import './preview.css';
import { ConfirmModalProvider } from '../src/ui/modal/confirm-modal';

import { ThemeProvider, useTheme as useNextTheme } from 'next-themes';
import type { ComponentType } from 'react';
import React, { useEffect } from 'react';
import type { Preview } from '@storybook/react';
import { setupGlobal } from '@affine/env/global';

setupGlobal();

export const parameters: Preview = {
  argTypes: {
    param: {
      table: { category: 'Group' },
    },
  },
};
export const globalTypes = {
  theme: {
    description: 'Global theme for components',
    defaultValue: 'light',
    toolbar: {
      title: 'theme',
      icon: 'circlehollow',
      dynamic: true,
      items: [
        { value: 'light', title: 'Light', icon: 'sun' },
        { value: 'dark', title: 'Dark', icon: 'moon' },
      ],
    },
  },
};

const ThemeToggle = ({ context }) => {
  const { theme } = context.globals;
  const { setTheme } = useNextTheme();

  useEffect(() => {
    setTheme(theme);
  }, [theme]);

  return null;
};

export const decorators = [
  (Story: ComponentType, context) => {
    return (
      <ThemeProvider themes={['dark', 'light']} enableSystem={true}>
        <ThemeToggle context={context} />
        <ConfirmModalProvider>
          <Story {...context} />
        </ConfirmModalProvider>
      </ThemeProvider>
    );
  },
];
export const tags = ['autodocs'];
