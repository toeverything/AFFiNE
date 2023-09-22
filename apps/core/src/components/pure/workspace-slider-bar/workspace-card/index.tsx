import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  CloudWorkspaceIcon,
  LocalWorkspaceIcon,
  NoNetworkIcon,
  UnsyncIcon,
} from '@blocksuite/icons';
import { Avatar } from '@toeverything/components/avatar';
import { Tooltip } from '@toeverything/components/tooltip';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { atom, useSetAtom } from 'jotai';
import {
  forwardRef,
  type HTMLAttributes,
  type MouseEvent,
  useCallback,
  useMemo,
} from 'react';

import { useDatasourceSync } from '../../../../hooks/use-datasource-sync';
import { useSystemOnline } from '../../../../hooks/use-system-online';
import type { AllWorkspace } from '../../../../shared';
import { Loading } from './loading-icon';
import {
  StyledSelectorContainer,
  StyledSelectorWrapper,
  StyledWorkspaceName,
  StyledWorkspaceStatus,
} from './styles';

const hoverAtom = atom(false);

// FIXME:
// 1. Remove mui style
// 2. Refactor the code to improve readability
const CloudWorkspaceStatus = () => {
  return (
    <>
      <CloudWorkspaceIcon />
      AFFiNE Cloud
    </>
  );
};

const SyncingWorkspaceStatus = () => {
  return (
    <>
      <Loading />
      Syncing...
    </>
  );
};

const UnSyncWorkspaceStatus = () => {
  return (
    <>
      <UnsyncIcon />
      Wait for upload
    </>
  );
};

const LocalWorkspaceStatus = () => {
  return (
    <>
      <LocalWorkspaceIcon />
      Local
    </>
  );
};

const OfflineStatus = () => {
  return (
    <>
      <NoNetworkIcon />
      Offline
    </>
  );
};

const WorkspaceStatus = ({
  currentWorkspace,
}: {
  currentWorkspace: AllWorkspace;
}) => {
  const isOnline = useSystemOnline();

  // todo: finish display sync status
  const [forceSyncStatus, startForceSync] = useDatasourceSync(
    currentWorkspace.blockSuiteWorkspace
  );

  const setIsHovered = useSetAtom(hoverAtom);

  const content = useMemo(() => {
    if (currentWorkspace.flavour === WorkspaceFlavour.LOCAL) {
      return 'Saved locally';
    }
    if (!isOnline) {
      return 'Disconnected, please check your network connection';
    }
    switch (forceSyncStatus.type) {
      case 'syncing':
        return 'Syncing with AFFiNE Cloud';
      case 'error':
        return 'Sync failed due to server issues, please try again later.';
      default:
        return 'Sync with AFFiNE Cloud';
    }
  }, [currentWorkspace.flavour, forceSyncStatus.type, isOnline]);

  const CloudWorkspaceSyncStatus = useCallback(() => {
    if (forceSyncStatus.type === 'syncing') {
      return SyncingWorkspaceStatus();
    } else if (forceSyncStatus.type === 'error') {
      return UnSyncWorkspaceStatus();
    } else {
      return CloudWorkspaceStatus();
    }
  }, [forceSyncStatus.type]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (
        currentWorkspace.flavour === WorkspaceFlavour.LOCAL ||
        forceSyncStatus.type === 'syncing'
      ) {
        return;
      }
      startForceSync();
    },
    [currentWorkspace.flavour, forceSyncStatus.type, startForceSync]
  );
  return (
    <div style={{ display: 'flex' }}>
      <Tooltip content={content}>
        <StyledWorkspaceStatus
          onMouseEnter={() => {
            setIsHovered(true);
          }}
          onMouseLeave={() => setIsHovered(false)}
          onClick={handleClick}
        >
          {currentWorkspace.flavour === WorkspaceFlavour.AFFINE_CLOUD ? (
            !isOnline ? (
              <OfflineStatus />
            ) : (
              <CloudWorkspaceSyncStatus />
            )
          ) : (
            <LocalWorkspaceStatus />
          )}
        </StyledWorkspaceStatus>
      </Tooltip>
    </div>
  );
};

export const WorkspaceCard = forwardRef<
  HTMLDivElement,
  {
    currentWorkspace: AllWorkspace;
  } & HTMLAttributes<HTMLDivElement>
>(({ currentWorkspace, ...props }, ref) => {
  const [name] = useBlockSuiteWorkspaceName(
    currentWorkspace.blockSuiteWorkspace
  );

  const [workspaceAvatar] = useBlockSuiteWorkspaceAvatarUrl(
    currentWorkspace.blockSuiteWorkspace
  );

  return (
    <StyledSelectorContainer
      role="button"
      tabIndex={0}
      data-testid="current-workspace"
      id="current-workspace"
      ref={ref}
      {...props}
    >
      <Avatar
        data-testid="workspace-avatar"
        size={40}
        url={workspaceAvatar}
        name={name}
        colorfulFallback
      />
      <StyledSelectorWrapper>
        <StyledWorkspaceName data-testid="workspace-name">
          {name}
        </StyledWorkspaceName>
        <WorkspaceStatus currentWorkspace={currentWorkspace} />
      </StyledSelectorWrapper>
    </StyledSelectorContainer>
  );
});

WorkspaceCard.displayName = 'WorkspaceCard';
