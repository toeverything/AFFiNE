import { ResizeObserver } from '@juggle/resize-observer';

(function polyfillResizeObserver() {
  if (typeof window !== 'undefined') {
    window.ResizeObserver = ResizeObserver;
  }
})();
