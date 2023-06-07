import { getLinkPreview } from 'link-preview-js';

import { getMetaData } from './server/get-meta-data';

export default {
  getBookmarkDataByLink: async (_: unknown, url: string) => {
    const data1 = await getLinkPreview(
      'https://twitter.com/HimeWorks/status/1299973665916936192',
      {
        timeout: 6000,
        headers: {
          'user-agent': 'googlebot',
        },
        followRedirects: 'follow',
      }
    );
    console.log('data1', data1);

    return getMetaData(url, {
      shouldReGetHTML: metaData => {
        return !metaData.title && !metaData.description;
      },
    });
  },
};
