import { getMetaData } from './server/get-meta-data';

// todo(himself65): for now it will be registered to window.apis.ui
//  in the future, each plugin should have it's own lifecycle using worker thread
export default {
  getBookmarkDataByLink: async (
    _: Electron.IpcMainInvokeEvent,
    url: string
  ) => {
    return getMetaData(url, {
      shouldReGetHTML: metaData => {
        return !metaData.title && !metaData.description;
      },
    });
  },
};
