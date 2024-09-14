import { ResizeObserver } from '@juggle/resize-observer';

export function polyfillResizeObserver() {
  window.ResizeObserver = ResizeObserver;
}
