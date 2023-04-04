import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { CloudWorkspaceIcon, LocalWorkspaceIcon } from '@blocksuite/icons';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-blocksuite-workspace-name';
import type React from 'react';

import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';
import type { AllWorkspace } from '../../../../shared';
import {
  StyledSelectorContainer,
  StyledSelectorWrapper,
  StyledWorkspaceName,
  StyledWorkspaceStatus,
} from './styles';

export type WorkspaceSelectorProps = {
  currentWorkspace: AllWorkspace | null;
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
