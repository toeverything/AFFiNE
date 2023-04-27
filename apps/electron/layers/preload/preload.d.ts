/* eslint-disable @typescript-eslint/consistent-type-imports */

interface Window {
  apis: typeof import('./src/affine-apis').apis;
  appInfo: typeof import('./src/affine-apis').appInfo;
}
