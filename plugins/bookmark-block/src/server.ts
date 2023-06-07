import { getMetaData } from './server/get-meta-data';

export default {
  getBookmarkDataByLink: async (_: unknown, url: string) => {
    return getMetaData(url, {
      shouldReGetHTML: metaData => {
        return !metaData.title && !metaData.description;
      },
    });
  },
};
