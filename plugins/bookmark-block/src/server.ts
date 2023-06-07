import type { ServerAdapter } from '@toeverything/plugin-infra/type';

import { getMetaData } from './server/get-meta-data';

const adapter: ServerAdapter = affine => {
  affine.registerCommand(
    'com.blocksuite.bookmark-block.get-bookmark-data-by-link',
    async (url: string) => {
      return getMetaData(url, {
        shouldReGetHTML: metaData => {
          return !metaData.title && !metaData.description;
        },
      });
    }
  );
  return () => {
    affine.unregisterCommand(
      'com.blocksuite.bookmark-block.get-bookmark-data-by-link'
    );
  };
};

export default adapter;
