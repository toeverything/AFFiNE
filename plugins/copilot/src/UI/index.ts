import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';
import { createElement } from 'react';

import { DebugContent } from './debug-content';
import { DetailContent } from './detail-content';
import { HeaderItem } from './header-item';

export default {
  headerItem: props => createElement(HeaderItem, props),
  detailContent: props => createElement(DetailContent, props),
  debugContent: props => createElement(DebugContent, props),
} satisfies Partial<PluginUIAdapter>;
