import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  type SyncEngineStatus,
  SyncEngineStep,
} from '@affine/workspace/providers';
import {
  CloudWorkspaceIcon,
  InformationFillDuotoneIcon,
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
      {!environment.isDesktop ? (
        <InformationFillDuotoneIcon data-warning-color="true" />
      ) : (
        <LocalWorkspaceIcon />
      )}
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

  const [syncEngineStatus, setSyncEngineStatus] =
    useState<SyncEngineStatus | null>(null);

  const syncEngine = useCurrentSyncEngine();

  useEffect(() => {
    setSyncEngineStatus(syncEngine?.status ?? null);
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
      if (!environment.isDesktop) {
        return 'This is a local demo workspace.';
      }
      return 'Saved locally';
    }
    if (!isOnline) {
      return 'Disconnected, please check your network connection';
    }
    if (!syncEngineStatus || syncEngineStatus.step === SyncEngineStep.Syncing) {
      return 'Syncing with AFFiNE Cloud';
    }
    if (syncEngineStatus.retrying) {
      return 'Sync disconnected due to unexpected issues, reconnecting.';
    }
    return 'Synced with AFFiNE Cloud';
  }, [currentWorkspace.flavour, isOnline, syncEngineStatus]);

  const CloudWorkspaceSyncStatus = useCallback(() => {
    if (!syncEngineStatus || syncEngineStatus.step === SyncEngineStep.Syncing) {
      return SyncingWorkspaceStatus();
    } else if (syncEngineStatus.retrying) {
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
