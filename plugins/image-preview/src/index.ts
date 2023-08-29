import type { PluginContext } from '@affine/sdk/entry';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';

export const entry = (context: PluginContext) => {
  context.register('editor', (div, editor) => {
    const root = createRoot(div);
    root.render(createElement(App, { page: editor.page }));
    return () => {
      root.unmount();
    };
  });
  return () => {
    // do nothing
  };
};
