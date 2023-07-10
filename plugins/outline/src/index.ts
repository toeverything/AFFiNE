import { definePlugin } from '@toeverything/plugin-infra/manager';
import { ReleaseStage } from '@toeverything/plugin-infra/type';

definePlugin(
  {
    id: 'com.affine.outline',
    name: {
      fallback: 'AFFiNE Outline',
      i18nKey: 'com.affine.outline.name',
    },
    description: {
      fallback:
        'AFFiNE Outline will help you with best writing experience on the World.',
    },
    publisher: {
      name: {
        fallback: 'AFFiNE',
        i18nKey: 'com.affine.org',
      },
      link: 'https://affine.pro',
    },
    stage: ReleaseStage.NIGHTLY,
    commands: [],
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
