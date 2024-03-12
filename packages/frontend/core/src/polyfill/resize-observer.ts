import { ResizeObserver } from '@juggle/resize-observer';

// prevents the following error in development mode:
// ResizeOvserver loop limit exceeded
// https://github.com/petyosi/react-virtuoso/issues/875#issuecomment-1962897033
if (process.env.NODE_ENV !== 'production') {
  window.ResizeObserver = ResizeObserver;
}
