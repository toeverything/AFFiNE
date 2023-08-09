import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import type { StatusAdapter } from '@affine/y-provider';
import { CloudWorkspaceIcon, LocalWorkspaceIcon } from '@blocksuite/icons';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useDataSourceStatus } from '@toeverything/hooks/use-data-source-status';
import type { IndexedDBProvider } from '@toeverything/y-indexeddb';
import type React from 'react';
import { useCallback, useEffect, useMemo } from 'react';

import type { AllWorkspace } from '../../../../shared';
import { workspaceAvatarStyle } from './index.css';
import {
  StyledSelectorContainer,
  StyledSelectorWrapper,
  StyledWorkspaceName,
  StyledWorkspaceStatus,
} from './styles';

export interface WorkspaceSelectorProps {
  currentWorkspace: AllWorkspace;
  onClick: () => void;
}

type WorkspaceStatusBarProps = {
  currentWorkspace: AllWorkspace;
};

type WorkspaceStatusBarImplProps = {
  provider: StatusAdapter;
};

const WorkspaceStatusBarImpl = ({ provider }: WorkspaceStatusBarImplProps) => {
  const status = useDataSourceStatus(provider);
  return <div>{status.type}</div>;
};

const WorkspaceStatusBar = ({ currentWorkspace }: WorkspaceStatusBarProps) => {
  const mainProvider = useMemo(
    () =>
      currentWorkspace.blockSuiteWorkspace.providers.find(
        provider => provider.flavour === 'local-indexeddb-background'
      ) as IndexedDBProvider | undefined,
    [currentWorkspace.blockSuiteWorkspace.providers]
  );
  useEffect(() => {
    console.log(mainProvider);
  }, [mainProvider]);
  if (!mainProvider) {
    return null;
  }
  return <WorkspaceStatusBarImpl provider={mainProvider} />;
};

/**
 * @todo-Doma Co-locate WorkspaceListModal with {@link WorkspaceSelector},
 *            because it's never used elsewhere.
 */
export const WorkspaceSelector = ({
  currentWorkspace,
  onClick,
}: WorkspaceSelectorProps) => {
  const [name] = useBlockSuiteWorkspaceName(
    currentWorkspace?.blockSuiteWorkspace
  );

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
        workspace={currentWorkspace?.blockSuiteWorkspace ?? null}
      />
      <StyledSelectorWrapper>
        <StyledWorkspaceName data-testid="workspace-name">
          {name}
        </StyledWorkspaceName>
        <WorkspaceStatusBar currentWorkspace={currentWorkspace} />
        <StyledWorkspaceStatus>
          {currentWorkspace.flavour === 'local' ? (
            <LocalWorkspaceIcon />
          ) : (
            <CloudWorkspaceIcon />
          )}
          {currentWorkspace.flavour === 'local' ? 'Local' : 'AFFiNE Cloud'}
        </StyledWorkspaceStatus>
      </StyledSelectorWrapper>
    </StyledSelectorContainer>
  );
};
