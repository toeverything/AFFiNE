import type { PluginContext } from '@toeverything/plugin-infra/entry';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';

export const entry = (context: PluginContext) => {
  console.log('register');

  context.register('editor', (div, editor) => {
    const root = createRoot(div);
    root.render(createElement(App, { page: editor.page }));
    return () => {
      root.unmount();
    };
  });

  return () => {
    console.log('unregister');
  };
};
