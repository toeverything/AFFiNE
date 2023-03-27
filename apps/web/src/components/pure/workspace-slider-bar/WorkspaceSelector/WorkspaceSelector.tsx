import { CloudWorkspaceIcon, LocalWorkspaceIcon } from '@blocksuite/icons';
import type React from 'react';

import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';
import { useBlockSuiteWorkspaceName } from '../../../../hooks/use-blocksuite-workspace-name';
import type { RemWorkspace } from '../../../../shared';
import { WorkspaceAvatar } from '../../workspace-avatar';
import {
  StyledSelectorContainer,
  StyledSelectorWrapper,
  StyledWorkspaceName,
  StyledWorkspaceStatus,
} from './styles';

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
  const [workspace] = useCurrentWorkspace();
  return (
    <StyledSelectorContainer onClick={onClick} data-testid="current-workspace">
      <WorkspaceAvatar
        data-testid="workspace-avatar"
        style={{
          flexShrink: 0,
        }}
        size={40}
        workspace={currentWorkspace}
      />
      <StyledSelectorWrapper>
        <StyledWorkspaceName data-testid="workspace-name">
          {name}
        </StyledWorkspaceName>
        {workspace && (
          <StyledWorkspaceStatus>
            {workspace.flavour === 'local' ? (
              <LocalWorkspaceIcon />
            ) : (
              <CloudWorkspaceIcon />
            )}
            {workspace.flavour === 'local' ? 'Local' : 'AFFiNE Cloud'}
          </StyledWorkspaceStatus>
        )}
      </StyledSelectorWrapper>
    </StyledSelectorContainer>
  );
};
