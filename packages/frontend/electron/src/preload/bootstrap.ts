import { contextBridge } from 'electron';

import { affine, appInfo, getElectronAPIs } from './electron-api';

const { apis, events } = getElectronAPIs();

contextBridge.exposeInMainWorld('appInfo', appInfo);
contextBridge.exposeInMainWorld('apis', apis);
contextBridge.exposeInMainWorld('events', events);

try {
  contextBridge.exposeInMainWorld('affine', affine);
} catch (error) {
  console.error('Failed to expose affine APIs to window object!', error);
}
