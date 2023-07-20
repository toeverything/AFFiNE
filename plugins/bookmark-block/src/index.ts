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
    commands: ['com.blocksuite.bookmark-block.get-bookmark-data-by-link'],
  },
  undefined,
  undefined,
  {
    load: () => import('./server'),
    hotModuleReload: onHot => onHot(import('./server')),
  }
);
