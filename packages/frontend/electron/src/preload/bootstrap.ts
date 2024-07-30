import { contextBridge } from 'electron';

import { appInfo, getElectronAPIs } from './electron-api';
import { sharedStorage } from './shared-storage';

const { apis, events } = getElectronAPIs();

contextBridge.exposeInMainWorld('appInfo', appInfo);
contextBridge.exposeInMainWorld('apis', apis);
contextBridge.exposeInMainWorld('events', events);
contextBridge.exposeInMainWorld('sharedStorage', sharedStorage);
