import './polyfill';
import '../src/theme';
import './preview.css';
import { ThemeProvider } from 'next-themes';
import type { ComponentType } from 'react';

import type { Preview } from '@storybook/react';
import React, { useEffect } from 'react';
import { ConfirmModalProvider } from '../src/ui/modal/confirm-modal';
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

const useTheme = context => {
  const { theme } = context.globals;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
};

export const decorators = [
  (Story: ComponentType, context) => {
    useTheme(context);
    return (
      <ThemeProvider themes={['dark', 'light']} enableSystem={true}>
        <ConfirmModalProvider>
          <Story {...context} />
        </ConfirmModalProvider>
      </ThemeProvider>
    );
  },
];
export const tags = ['autodocs'];
