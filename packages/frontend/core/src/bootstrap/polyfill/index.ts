import { polyfillDispose } from './dispose';
import { polyfillPromise } from './promise-with-resolvers';
import { polyfillEventLoop } from './request-idle-callback';
import { polyfillResizeObserver } from './resize-observer';

export function polyfillElectron() {
  polyfillResizeObserver();
}

export async function polyfillBrowser() {
  polyfillResizeObserver();
  polyfillEventLoop();
  await polyfillPromise();
  await polyfillDispose();
}
