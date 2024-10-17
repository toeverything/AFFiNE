import { polyfillDispose } from './dispose';
import { polyfillI18n } from './intl-segmenter';
import { polyfillPromise } from './promise-with-resolvers';
import { polyfillEventLoop } from './request-idle-callback';
import { polyfillResizeObserver } from './resize-observer';

polyfillResizeObserver();
polyfillEventLoop();
await polyfillI18n();
await polyfillPromise();
await polyfillDispose();
