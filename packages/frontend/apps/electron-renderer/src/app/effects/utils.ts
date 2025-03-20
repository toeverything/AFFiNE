import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkspacesService } from '@affine/core/modules/workspace';
import type { FrameworkProvider } from '@toeverything/infra';

export function getCurrentWorkspace(frameworkProvider: FrameworkProvider) {
  const currentWorkspaceId = frameworkProvider
    .get(GlobalContextService)
    .globalContext.workspaceId.get();
  const workspacesService = frameworkProvider.get(WorkspacesService);
  const workspaceRef = currentWorkspaceId
    ? workspacesService.openByWorkspaceId(currentWorkspaceId)
    : null;
  if (!workspaceRef) {
    return;
  }
  const { workspace, dispose } = workspaceRef;

  return {
    workspace,
    dispose,
    [Symbol.dispose]: dispose,
  };
}
