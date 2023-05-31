import { definePlugin } from '@toeverything/plugin-infra/manager';
import { ReleaseStage } from '@toeverything/plugin-infra/type';

definePlugin(
  {
    id: 'com.blocksuite.bookmark-block',
    name: {
      fallback: 'BlockSuite Bookmark Block',
      i18nKey: 'com.blocksuite.bookmark.name',
    },
    description: {
      fallback: 'Bookmark block',
    },
    publisher: {
      name: {
        fallback: 'AFFiNE',
      },
      link: 'https://affine.pro',
    },
    stage: ReleaseStage.NIGHTLY,
    version: '0.0.1',
  },
  undefined,
  {
    load: () => import('./blocksuite/index'),
    hotModuleReload: onHot =>
      import.meta.webpackHot &&
      import.meta.webpackHot.accept('./blocksuite', () =>
        onHot(import('./blocksuite/index'))
      ),
  }
);
