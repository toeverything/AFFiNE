/* eslint-disable @typescript-eslint/consistent-type-imports */

declare interface Window {
  apis: import('./src/affine-apis').PreloadHandlers;
  events: import('./src/affine-apis').MainIPCEventMap;
}
