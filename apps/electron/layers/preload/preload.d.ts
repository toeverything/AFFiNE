/* eslint-disable @typescript-eslint/consistent-type-imports */

interface Window {
  apis: typeof import('./src/affine-apis').apis;
  events: typeof import('./src/affine-apis').events;
  appInfo: typeof import('./src/affine-apis').appInfo;
}
