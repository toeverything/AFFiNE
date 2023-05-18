module.exports.createFSWatcher = function createFSWatcher() {
  // require it in the function level so that it won't break the `generate-main-exposed-meta.mjs`
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { FsWatcher } = require('./index');
  return FsWatcher;
};
