import type { PluginContext } from '@affine/sdk/entry';
import { createElement } from 'react';
import { lazy } from 'react';
import { createRoot } from 'react-dom/client';

const HeaderButton = lazy(() =>
  import('./entry').then(({ HeaderButton }) => ({ default: HeaderButton }))
);

export const entry = (context: PluginContext) => {
  context.register('headerItem', div => {
    const root = createRoot(div);

    root.render(
      createElement(
        context.utils.PluginProvider,
        {},
        createElement(HeaderButton, {
          Provider: context.utils.PluginProvider,
        })
      )
    );

    return () => {
      root.unmount();
    };
  });

  return () => {
    console.log('unregister');
  };
};
