import { useWorkspace } from '@affine/core/components/hooks/use-workspace';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { FrameworkScope, useLiveData, useService } from '@toeverything/infra';

export const CurrentWorkspaceScopeProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const globalContext = useService(GlobalContextService).globalContext;
  const workspacesService = useService(WorkspacesService);
  const workspaceMeta = useLiveData(workspacesService.list.workspaces$).find(
    workspace => workspace.id === globalContext.workspaceId.get()
  );
  const workspace = useWorkspace(workspaceMeta);
  if (!workspace) {
    // todo(@pengx17): render a loading/error component here if not found?
    return null;
  }
  return <FrameworkScope scope={workspace.scope}>{children}</FrameworkScope>;
};
