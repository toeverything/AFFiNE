/**
 * @module preload
 */

import { contextBridge } from 'electron';

import * as affineApis from './affine-apis';

/**
 * The "Main World" is the JavaScript context that your main renderer code runs in.
 * By default, the page you load in your renderer executes code in this world.
 *
 * @see https://www.electronjs.org/docs/api/context-bridge
 */

contextBridge.exposeInMainWorld('apis', affineApis.apis);
contextBridge.exposeInMainWorld('events', affineApis.events);
contextBridge.exposeInMainWorld('appInfo', affineApis.appInfo);
