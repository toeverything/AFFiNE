import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { CloudWorkspaceIcon, LocalWorkspaceIcon } from '@blocksuite/icons';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import type React from 'react';
import { useCallback } from 'react';

import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';
import type { AllWorkspace } from '../../../../shared';
import { workspaceAvatarStyle } from './index.css';
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

/**
 * @todo-Doma Co-locate WorkspaceListModal with {@link WorkspaceSelector},
 *            because it's never used elsewhere.
 */
export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  currentWorkspace,
  onClick,
}) => {
  const [name] = useBlockSuiteWorkspaceName(
    currentWorkspace?.blockSuiteWorkspace ?? null
  );
  const [workspace] = useCurrentWorkspace();

  // Open dialog when `Enter` or `Space` pressed
  // TODO-Doma Refactor with `@radix-ui/react-dialog` or other libraries that handle these out of the box and be accessible by default
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // TODO-Doma Rename this callback to `onOpenDialog` or something to reduce ambiguity.
        onClick();
      }
    },
    [onClick]
  );

  return (
    <StyledSelectorContainer
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      data-testid="current-workspace"
    >
      <WorkspaceAvatar
        data-testid="workspace-avatar"
        className={workspaceAvatarStyle}
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
