import { getMetaData } from './server/get-meta-data';

const getBookmarkDataByLink = async (_: unknown, url: string) => {
  return getMetaData(url, {
    shouldReGetHTML: metaData => {
      return !metaData.title && !metaData.description;
    },
  });
};

export default {
  getBookmarkDataByLink,
};
