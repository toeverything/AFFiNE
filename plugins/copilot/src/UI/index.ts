import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { createElement } from 'react';
import { createPortal } from 'react-dom';

import { DetailContent } from './detail-content';
import { HeaderItem } from './header-item';

export default {
  headerItem: element => createPortal(createElement(HeaderItem), element),
  detailContent: element => createPortal(createElement(DetailContent), element),
} satisfies Partial<PluginUIAdapter>;
