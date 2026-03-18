import '@sentry/electron/preload';

import { contextBridge } from 'electron';

import { isInternalUrl } from '../main/security-restrictions';
import { apis, appInfo, events } from './electron-api';
import { sharedStorage } from './shared-storage';
import { listenWorkerApis } from './worker';

const locationLike = (globalThis as { location?: { href?: unknown } }).location;

const currentUrl =
  typeof locationLike?.href === 'string' ? locationLike.href : null;

if (currentUrl && isInternalUrl(currentUrl)) {
  contextBridge.exposeInMainWorld('__appInfo', appInfo);
  contextBridge.exposeInMainWorld('__apis', apis);
  contextBridge.exposeInMainWorld('__events', events);
  contextBridge.exposeInMainWorld('__sharedStorage', sharedStorage);

  listenWorkerApis();
}
