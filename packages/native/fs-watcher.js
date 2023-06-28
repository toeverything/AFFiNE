module.exports.createFSWatcher = function createFSWatcher() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { FsWatcher } = require('./index');
  return FsWatcher;
};
