import { contextBridge } from 'electron';

import { affine, appInfo, cmdFind, getElectronAPIs } from './electron-api';

const { apis, events } = getElectronAPIs();

contextBridge.exposeInMainWorld('appInfo', appInfo);
contextBridge.exposeInMainWorld('apis', apis);
contextBridge.exposeInMainWorld('events', events);

try {
  contextBridge.exposeInMainWorld('affine', affine);
  contextBridge.exposeInMainWorld('cmdFind', cmdFind);
} catch (error) {
  console.error('Failed to expose affine APIs to window object!', error);
}
