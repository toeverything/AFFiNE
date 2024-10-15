import '../types/types.d.ts';

import { setupEnvironment } from './app';
import { polyfillBrowser, polyfillElectron } from './polyfill';

export function setupElectron() {
  polyfillElectron();
  setupEnvironment();
}

export async function setupBrowser() {
  await polyfillBrowser();
  setupEnvironment();
  __webpack_public_path__ = environment.publicPath;
}
