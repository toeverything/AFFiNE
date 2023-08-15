import type { PluginContext } from '@affine/sdk/entry';
import { registerTOCComponents } from '@blocksuite/blocks';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { HeaderItem } from './app';

export const entry = (context: PluginContext) => {
  console.log('register outline');

  context.register('headerItem', div => {
    registerTOCComponents(components => {
      for (const compName in components) {
        if (window.customElements.get(compName)) continue;

        window.customElements.define(
          compName,
          components[compName as keyof typeof components]
        );
      }
    });

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
