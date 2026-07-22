import { Component as IndexComponent } from '@affine/core/desktop/pages/index';

import { AppFallback } from '../components/app-fallback';

// Default route fallback for mobile

export const Component = () => {
  // TODO: replace with a mobile version
  return (
    <IndexComponent
      defaultIndexRoute={'home'}
      fallback={<AppFallback />}
      createErrorFallback={retry => <AppFallback onRetry={retry} />}
    />
  );
};
