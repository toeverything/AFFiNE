import { pathGenerator } from '@affine/core/shared';
import { type LoaderFunction, redirect } from 'react-router-dom';

export const loader: LoaderFunction = async ({ request, params }) => {
  if (params.workspaceId) {
    const workspaceId = params.workspaceId;
    const url = new URL(request.url);
    if (url.pathname === pathGenerator.pages(workspaceId)) {
      const path = `/workspace/${workspaceId}/pages/docs`;
      return redirect(path);
    }
  }

  return null;
};
