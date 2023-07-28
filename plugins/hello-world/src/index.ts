import {
  currentWorkspaceIdAtom,
  rootStore,
} from '@toeverything/plugin-infra/atom';
import type { PluginContext } from '@toeverything/plugin-infra/entry';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { HeaderItem } from './app';

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

  // sample for new indexedDB API
  context.indexedDB.set('sample', 'hello, world!');
  context.indexedDB.get('sample').then(console.log);
  context.indexedDB.getKeys().then(console.log);

  return () => {
    console.log('unregister');
  };
};
