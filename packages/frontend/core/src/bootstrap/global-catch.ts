import * as Sentry from '@sentry/react';

window.addEventListener('error', event => {
  const { error } = event;
  Sentry.withScope(scope => {
    if (error.stack.includes('blocksuite')) {
      scope.setTag('category', 'blocksuite');
    }
    Sentry.captureException(error);
  });
});
