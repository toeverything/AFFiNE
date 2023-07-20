import type { PluginContext } from '@toeverything/plugin-infra/entry';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { DetailContent } from './UI/detail-content';
import { HeaderItem } from './UI/header-item';

export const entry = (context: PluginContext) => {
  context.register('headerItem', div => {
    const root = createRoot(div);
    root.render(
      createElement(context.utils.PluginProvider, {}, createElement(HeaderItem))
    );
    return () => {
      root.unmount();
    };
  });

  context.register('window', div => {
    const root = createRoot(div);
    root.render(
      createElement(
        context.utils.PluginProvider,
        {},
        createElement(DetailContent)
      )
    );
    return () => {
      root.unmount();
    };
  });
  return () => {};
};
