import { Component as IndexComponent } from '@affine/core/pages/index';
import { WorkspaceSubPath } from '@affine/core/shared';

// Default route fallback for mobile

export const Component = () => {
  // TODO: replace with a mobile version
  return <IndexComponent defaultIndexRoute={WorkspaceSubPath.HOME} />;
};
