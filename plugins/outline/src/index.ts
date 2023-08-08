import type { PluginContext } from '@affine/sdk/entry';
import { createElement } from 'react';
import { lazy } from 'react';
import { createRoot } from 'react-dom/client';

const HeaderItem = lazy(() =>
  import('./app').then(({ HeaderItem }) => ({ default: HeaderItem }))
);

export const entry = (context: PluginContext) => {
  console.log('register');
  console.log('hello, world!');
  context.register('headerItem', div => {
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
