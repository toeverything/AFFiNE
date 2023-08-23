import { Tooltip } from '@affine/component';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { CloudWorkspaceIcon, LocalWorkspaceIcon } from '@blocksuite/icons';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import type React from 'react';
import { useCallback, useState } from 'react';

import { useCurrentUser } from '../../../../hooks/affine/use-current-user';
import { useSystemOnline } from '../../../../hooks/use-system-online';
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

/**
 * @todo-Doma Co-locate WorkspaceListModal with {@link WorkspaceSelector},
 *            because it's never used elsewhere.
 */
export const WorkspaceSelector = ({
  currentWorkspace,
  onClick,
}: WorkspaceSelectorProps) => {
  const [name] = useBlockSuiteWorkspaceName(
    currentWorkspace.blockSuiteWorkspace
  );
  const user = useCurrentUser();
  const [isHovered, setIsHovered] = useState(false);
  // Open dialog when `Enter` or `Space` pressed
  // TODO-Doma Refactor with `@radix-ui/react-dialog` or other libraries that handle these out of the box and be accessible by default
  // TODO: Delete this?
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
  const fakeStatus = 'waitForUpload';
  const isOnline = useSystemOnline();
  const tooltipsContentMap = {
    local: 'Saved locally',
    cloud: `Synced with ${user.email}`,
    syncing: `Syncing with ${user.email}`,
    waitForUpload: 'Sync failed due to server issues, please try again later.',
    offline: 'Disconnected, please check your network connection',
    failNoLocalSpace: 'Sync failed due to insufficient local storage space.',
    failNoCloudSpace: 'Sync failed due to insufficient cloud storage space.',
  };
  const tooltipsContent = (() => {
    if (!isOnline) {
      return tooltipsContentMap.offline;
    }
    if (currentWorkspace.flavour === 'local') {
      switch (fakeStatus) {
        case 'failNoLocalSpace':
          return tooltipsContentMap.failNoLocalSpace;
        default:
          return tooltipsContentMap.local;
      }
    }
    if (currentWorkspace.flavour === 'affine-cloud') {
      switch (fakeStatus) {
        case 'syncing':
          return tooltipsContentMap.syncing;
        case 'waitForUpload':
          return tooltipsContentMap.waitForUpload;
        case 'failNoCloudSpace':
          return tooltipsContentMap.failNoCloudSpace;
        default:
          return tooltipsContentMap.cloud;
      }
    }
    return tooltipsContentMap.waitForUpload;
  })();
  return (
    <StyledSelectorContainer
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      disableHoverBackground={isHovered}
      data-testid="current-workspace"
      id="current-workspace"
    >
      <WorkspaceAvatar
        data-testid="workspace-avatar"
        className={workspaceAvatarStyle}
        size={40}
        workspace={currentWorkspace.blockSuiteWorkspace}
      />
      <StyledSelectorWrapper>
        <StyledWorkspaceName data-testid="workspace-name">
          {name}
        </StyledWorkspaceName>
        <div style={{ display: 'flex' }}>
          <Tooltip
            content={tooltipsContent}
            showArrow
            placement="top"
            style={{ fontSize: 'var(--affine-font-sm)' }}
          >
            <StyledWorkspaceStatus
              onMouseEnter={() => {
                setIsHovered(true);
              }}
              onMouseLeave={() => setIsHovered(false)}
              onClick={e => e.stopPropagation()}
            >
              {currentWorkspace.flavour === 'local' ? (
                <LocalWorkspaceIcon />
              ) : (
                <CloudWorkspaceIcon />
              )}
              {currentWorkspace.flavour === 'local' ? 'Local' : 'AFFiNE Cloud'}
            </StyledWorkspaceStatus>
          </Tooltip>
        </div>
      </StyledSelectorWrapper>
    </StyledSelectorContainer>
  );
};
