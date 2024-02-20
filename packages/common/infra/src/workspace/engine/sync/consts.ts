export enum SyncEngineStep {
  // error
  Rejected = -1,
  // in progress
  Stopped = 0,
  Syncing = 1,
  // finished
  Synced = 2,
}

export enum SyncPeerStep {
  // error
  VersionRejected = -1,
  // in progress
  Stopped = 0,
  Retrying = 1,
  LoadingRootDoc = 2,
  LoadingSubDoc = 3,
  Loaded = 4.5,
  Syncing = 5,
  // finished
  Synced = 6,
}
