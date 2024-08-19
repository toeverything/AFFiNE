import '@sentry/electron/preload';

import { contextBridge } from 'electron';

import { appInfo, getElectronAPIs } from './electron-api';
import { sharedStorage } from './shared-storage';

const { apis, events } = getElectronAPIs();

contextBridge.exposeInMainWorld('__appInfo', appInfo);
contextBridge.exposeInMainWorld('__apis', apis);
contextBridge.exposeInMainWorld('__events', events);
contextBridge.exposeInMainWorld('__sharedStorage', sharedStorage);
