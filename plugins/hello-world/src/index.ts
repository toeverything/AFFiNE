import {
  currentWorkspaceIdAtom,
  rootStore,
} from '@toeverything/plugin-infra/atom';
import type { PluginContext } from '@toeverything/plugin-infra/entry';
import { createElement } from 'react';
import { lazy } from 'react';
import { createRoot } from 'react-dom/client';

const HeaderItem = lazy(() =>
  import('./app').then(({ HeaderItem }) => ({ default: HeaderItem }))
);

export const entry = (context: PluginContext) => {
  console.log('register');
  console.log('hello, world!');
  console.log(rootStore.get(currentWorkspaceIdAtom));
  context.register('headerItem', div => {
    const root = createRoot(div);
    root.render(createElement(HeaderItem));
    return () => {
      root.unmount();
    };
  });

  context.register('formatBar', div => {
    const root = createRoot(div);
    root.render(createElement(HeaderItem));
    return () => {
      root.unmount();
    };
  });

  return () => {
    console.log('unregister');
  };
};
