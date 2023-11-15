import { WorkspaceFlavour } from '@affine/env/workspace';
import { SyncEngineStatus } from '@affine/workspace/providers';
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
import { debounce } from 'lodash-es';
import {
  forwardRef,
  type HTMLAttributes,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useCurrentSyncEngine } from '../../../../hooks/current/use-current-sync-engine';
import { useSystemOnline } from '../../../../hooks/use-system-online';
import type { AllWorkspace } from '../../../../shared';
import { Loading } from './loading-icon';
import {
  StyledSelectorContainer,
  StyledSelectorWrapper,
  StyledWorkspaceName,
  StyledWorkspaceStatus,
} from './styles';

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

  const [syncEngineStatus, setSyncEngineStatus] = useState<SyncEngineStatus>(
    SyncEngineStatus.Synced
  );

  const syncEngine = useCurrentSyncEngine();

  useEffect(() => {
    setSyncEngineStatus(syncEngine?.status ?? SyncEngineStatus.Synced);
    const disposable = syncEngine?.onStatusChange.on(
      debounce(status => {
        setSyncEngineStatus(status);
      }, 500)
    );
    return () => {
      disposable?.dispose();
    };
  }, [syncEngine]);

  const content = useMemo(() => {
    // TODO: add i18n
    if (currentWorkspace.flavour === WorkspaceFlavour.LOCAL) {
      return 'Saved locally';
    }
    if (!isOnline) {
      return 'Disconnected, please check your network connection';
    }
    switch (syncEngineStatus) {
      case SyncEngineStatus.Syncing:
      case SyncEngineStatus.LoadingSubDoc:
      case SyncEngineStatus.LoadingRootDoc:
        return 'Syncing with AFFiNE Cloud';
      case SyncEngineStatus.Retrying:
        return 'Sync disconnected due to unexpected issues, reconnecting.';
      default:
        return 'Synced with AFFiNE Cloud';
    }
  }, [currentWorkspace.flavour, syncEngineStatus, isOnline]);

  const CloudWorkspaceSyncStatus = useCallback(() => {
    if (
      syncEngineStatus === SyncEngineStatus.Syncing ||
      syncEngineStatus === SyncEngineStatus.LoadingSubDoc ||
      syncEngineStatus === SyncEngineStatus.LoadingRootDoc
    ) {
      return SyncingWorkspaceStatus();
    } else if (syncEngineStatus === SyncEngineStatus.Retrying) {
      return UnSyncWorkspaceStatus();
    } else {
      return CloudWorkspaceStatus();
    }
  }, [syncEngineStatus]);

  return (
    <div style={{ display: 'flex' }}>
      <Tooltip content={content}>
        <StyledWorkspaceStatus>
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
