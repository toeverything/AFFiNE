import { Avatar } from '@affine/component/ui/avatar';
import { Loading } from '@affine/component/ui/loading';
import { Tooltip } from '@affine/component/ui/tooltip';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { type SyncEngineStatus, SyncEngineStep } from '@affine/workspace';
import { waitForCurrentWorkspaceAtom } from '@affine/workspace/atom';
import {
  CloudWorkspaceIcon,
  InformationFillDuotoneIcon,
  LocalWorkspaceIcon,
  NoNetworkIcon,
  UnsyncIcon,
} from '@blocksuite/icons';
import { useWorkspaceBlobObjectUrl } from '@toeverything/hooks/use-workspace-blob';
import { useWorkspaceInfo } from '@toeverything/hooks/use-workspace-info';
import { useAtomValue } from 'jotai';
import { debounce } from 'lodash-es';
import {
  forwardRef,
  type HTMLAttributes,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useSystemOnline } from '../../../../hooks/use-system-online';
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

const WorkspaceStatus = () => {
  const isOnline = useSystemOnline();

  const [syncEngineStatus, setSyncEngineStatus] =
    useState<SyncEngineStatus | null>(null);

  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);

  // debounce sync engine status
  useEffect(() => {
    setSyncEngineStatus(currentWorkspace.engine.sync.status);
    const disposable = currentWorkspace.engine.sync.onStatusChange.on(
      debounce(status => {
        setSyncEngineStatus(status);
      }, 500)
    );
    return () => {
      disposable?.dispose();
    };
  }, [currentWorkspace]);

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
  HTMLAttributes<HTMLDivElement>
>(({ ...props }, ref) => {
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);

  const information = useWorkspaceInfo(currentWorkspace.meta);

  const avatarUrl = useWorkspaceBlobObjectUrl(
    currentWorkspace.meta,
    information?.avatar
  );

  const name = information?.name ?? UNTITLED_WORKSPACE_NAME;

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
        url={avatarUrl}
        name={name}
        colorfulFallback
      />
      <StyledSelectorWrapper>
        <StyledWorkspaceName data-testid="workspace-name">
          {name}
        </StyledWorkspaceName>
        <WorkspaceStatus />
      </StyledSelectorWrapper>
    </StyledSelectorContainer>
  );
});

WorkspaceCard.displayName = 'WorkspaceCard';
