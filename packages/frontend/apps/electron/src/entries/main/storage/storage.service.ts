import path from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { app } from 'electron';

import { IpcEvent, IpcHandle, IpcScope } from '../../../ipc';
import { PersistentJsonFileStorageService } from './persistent-json-file';

@Injectable()
export class GlobalStateStorage extends PersistentJsonFileStorageService {
  constructor(logger: Logger) {
    super(path.join(app.getPath('userData'), 'global-state.json'), logger);
  }

  @IpcEvent({
    scope: IpcScope.SHARED_STORAGE,
  })
  globalStateChanged$ = this.watchAll();

  @IpcHandle({
    scope: IpcScope.SHARED_STORAGE,
  })
  getAllGlobalState() {
    return this.all();
  }

  @IpcHandle({
    scope: IpcScope.SHARED_STORAGE,
  })
  setGlobalState(key: string, value: any) {
    return this.set(key, value);
  }

  @IpcHandle({
    scope: IpcScope.SHARED_STORAGE,
  })
  delGlobalState(key: string) {
    return this.del(key);
  }

  @IpcHandle({
    scope: IpcScope.SHARED_STORAGE,
  })
  clearGlobalState() {
    return this.clear();
  }
}

@Injectable()
export class GlobalCacheStorage extends PersistentJsonFileStorageService {
  constructor(logger: Logger) {
    super(path.join(app.getPath('userData'), 'global-cache.json'), logger);
  }

  @IpcEvent({
    scope: IpcScope.SHARED_STORAGE,
  })
  globalCacheChanged$ = this.watchAll();

  @IpcHandle({
    scope: IpcScope.SHARED_STORAGE,
  })
  getAllGlobalCache() {
    return this.all();
  }

  @IpcHandle({
    scope: IpcScope.SHARED_STORAGE,
  })
  setGlobalCache(key: string, value: any) {
    return this.set(key, value);
  }

  @IpcHandle({
    scope: IpcScope.SHARED_STORAGE,
  })
  delGlobalCache(key: string) {
    return this.del(key);
  }

  @IpcHandle({
    scope: IpcScope.SHARED_STORAGE,
  })
  clearGlobalCache() {
    return this.clear();
  }
}
