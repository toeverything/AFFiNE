import { Component as IndexComponent } from '@affine/core/desktop/pages/index';

// Default route fallback for mobile

export const Component = () => {
  // TODO: replace with a mobile version
  return <IndexComponent defaultIndexRoute={'home'} />;
};
