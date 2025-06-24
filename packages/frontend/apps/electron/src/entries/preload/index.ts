import { contextBridge } from 'electron';

import { appInfo } from './api-info';
import { exposedEvents } from './ipc-events';
import { exposedApis } from './ipc-handlers';
import { sharedStorage } from './shared-storage';
import { listenWorkerApis } from './worker';

contextBridge.exposeInMainWorld('__appInfo', appInfo);
contextBridge.exposeInMainWorld('__apis', exposedApis);
contextBridge.exposeInMainWorld('__events', exposedEvents);
contextBridge.exposeInMainWorld('__sharedStorage', sharedStorage);

listenWorkerApis();
