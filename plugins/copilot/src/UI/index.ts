import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { createElement } from 'react';
import { createPortal } from 'react-dom';

import { HeaderItem } from './header-item';

export default {
  headerItem: element => createPortal(createElement(HeaderItem), element),
} satisfies Partial<PluginUIAdapter>;
