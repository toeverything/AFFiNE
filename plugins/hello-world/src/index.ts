import type { PluginContext } from '@toeverything/plugin-infra/entry';
import {
  currentEditor,
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
    createRoot(div).render(createElement(HeaderItem));
  });

  const unsub = rootStore.sub(currentEditor, () => {
    const editor = rootStore.get(currentEditor);
    console.log('editor change', editor);
  });

  return () => {
    console.log('unregister');
    unsub();
  };
};
