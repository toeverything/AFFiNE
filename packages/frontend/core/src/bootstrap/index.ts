import '../types/types.d.ts';

import { setupEnvironment } from './app';
import { polyfillBrowser, polyfillElectron } from './polyfill';

export function setupElectron() {
  setupEnvironment();
  polyfillElectron();
}

export async function setupBrowser() {
  setupEnvironment();
  __webpack_public_path__ = environment.publicPath;
  await polyfillBrowser();
}
