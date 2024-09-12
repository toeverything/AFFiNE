import path from 'node:path';

import { app } from 'electron';

import { PersistentJSONFileStorage } from './json-file';

export const globalStateStorage = new PersistentJSONFileStorage(
  path.join(app.getPath('userData'), 'global-state.json')
);

export const globalCacheStorage = new PersistentJSONFileStorage(
  path.join(app.getPath('userData'), 'global-cache.json')
);
