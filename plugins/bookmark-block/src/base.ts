import { ReleaseStage } from '@toeverything/plugin-infra/type';

export const definition = {
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
};
