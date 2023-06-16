import { definePlugin } from '@toeverything/plugin-infra/manager';
import { ReleaseStage } from '@toeverything/plugin-infra/type';

definePlugin(
  {
    id: 'com.affine.copilot',
    name: {
      fallback: 'AFFiNE Copilot',
      i18nKey: 'com.affine.copilot.name',
    },
    description: {
      fallback:
        'AFFiNE Copilot will help you with best writing experience on the World.',
    },
    publisher: {
      name: {
        fallback: 'AFFiNE',
      },
      link: 'https://affine.pro',
    },
    stage: ReleaseStage.NIGHTLY,
    version: '0.0.1',
    commands: [],
  },
  {
    load: () => import('./UI/index'),
    hotModuleReload: onHot =>
      import.meta.webpackHot &&
      import.meta.webpackHot.accept('./UI', () => onHot(import('./UI/index'))),
  }
);
