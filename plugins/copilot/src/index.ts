import type { PluginContext } from '@affine/sdk/entry';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { DebugContent } from './UI/debug-content';
import { DetailContent } from './UI/detail-content';
import { HeaderItem } from './UI/header-item';

export const entry = (context: PluginContext) => {
  console.log('copilot entry');
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

  context.register('setting', div => {
    const root = createRoot(div);
    root.render(
      createElement(
        context.utils.PluginProvider,
        {},
        createElement(DebugContent)
      )
    );
    return () => {
      root.unmount();
    };
  });
  return () => {};
};
