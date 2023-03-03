import React from 'react';

import { useBlockSuiteWorkspaceName } from '../../../../hooks/use-blocksuite-workspace-name';
import { RemWorkspace } from '../../../../shared';
import { WorkspaceAvatar } from '../../workspace-avatar';
import { SelectorWrapper, WorkspaceName } from './styles';

export type WorkspaceSelectorProps = {
  currentWorkspace: RemWorkspace | null;
  onClick: () => void;
};

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  currentWorkspace,
  onClick,
}) => {
  const [name] = useBlockSuiteWorkspaceName(
    currentWorkspace?.blockSuiteWorkspace ?? null
  );
  return (
    <>
      <SelectorWrapper onClick={onClick} data-testid="current-workspace">
        <WorkspaceAvatar
          data-testid="workspace-avatar"
          style={{
            flexShrink: 0,
          }}
          size={32}
          workspace={currentWorkspace}
        />
        <WorkspaceName data-testid="workspace-name">{name}</WorkspaceName>
      </SelectorWrapper>
    </>
  );
};
