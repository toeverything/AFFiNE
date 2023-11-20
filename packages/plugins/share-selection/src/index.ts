import type { PluginContext } from '@affine/sdk/entry';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { HeaderItem } from './app';

export const entry = (context: PluginContext) => {
  console.log('register share selection');

  context.register('headerItem', div => {
    div.style.height = '100%';

    const root = createRoot(div);
    root.render(
      createElement(
        context.utils.PluginProvider,
        {},
        createElement(HeaderItem, {
          Provider: context.utils.PluginProvider,
        })
      )
    );
    return () => {
      root.unmount();
    };
  });

  return () => {};
};
