import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { HeaderItem } from './header-item';

export default {
  headerItem: () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    root.render(createElement(HeaderItem));
    return div;
  },
} satisfies Partial<PluginUIAdapter>;
