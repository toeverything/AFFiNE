import { PageNotFoundError } from '@affine/env/constant';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import { type WorkspaceUISchema } from '@affine/env/workspace';

import { useWorkspace } from '../../hooks/use-workspace';
import { PageDetailEditor, Provider } from '../shared';

export const UI = {
  Provider,
  PageDetail: ({ currentWorkspaceId, currentPageId, onLoadEditor }) => {
    const workspace = useWorkspace(currentWorkspaceId);
    const page = workspace.blockSuiteWorkspace.getPage(currentPageId);
    if (!page) {
      throw new PageNotFoundError(workspace.blockSuiteWorkspace, currentPageId);
    }
    return (
      <PageDetailEditor
        pageId={currentPageId}
        onLoad={onLoadEditor}
        workspace={workspace.blockSuiteWorkspace}
      />
    );
  },
  NewSettingsDetail: () => {
    throw new Error('Not implemented');
  },
} satisfies WorkspaceUISchema<WorkspaceFlavour.AFFINE_PUBLIC>;
