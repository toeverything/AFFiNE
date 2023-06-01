import { definePlugin } from '@toeverything/plugin-infra/manager';

import { definition } from './base';

definePlugin(definition, undefined, {
  load: () => import('./blocksuite/index'),
  hotModuleReload: onHot =>
    import.meta.webpackHot &&
    import.meta.webpackHot.accept('./blocksuite', () =>
      onHot(import('./blocksuite/index'))
    ),
});
