import type { PluginContext } from '@toeverything/plugin-infra/entry';
import {
  currentWorkspaceIdAtom,
  rootStore,
} from '@toeverything/plugin-infra/manager';
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

  return () => {
    console.log('unregister');
  };
};
