import '@sentry/electron/preload';

import { contextBridge } from 'electron';

import { apis, appInfo, events } from './electron-api';
import { sharedStorage } from './shared-storage';
import { listenWorkerApis } from './worker';

contextBridge.exposeInMainWorld('__appInfo', appInfo);
contextBridge.exposeInMainWorld('__apis', apis);
contextBridge.exposeInMainWorld('__events', events);
contextBridge.exposeInMainWorld('__sharedStorage', sharedStorage);

listenWorkerApis();
