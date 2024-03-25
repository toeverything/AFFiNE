import { pushNotificationAtom } from '@affine/component/notification-center';
import { Avatar } from '@affine/component/ui/avatar';
import { Loading } from '@affine/component/ui/loading';
import { Tooltip } from '@affine/component/ui/tooltip';
import { openSettingModalAtom } from '@affine/core/atoms';
import { useDocEngineStatus } from '@affine/core/hooks/affine/use-doc-engine-status';
import { useIsWorkspaceOwner } from '@affine/core/hooks/affine/use-is-workspace-owner';
import { useWorkspaceBlobObjectUrl } from '@affine/core/hooks/use-workspace-blob';
import { useWorkspaceInfo } from '@affine/core/hooks/use-workspace-info';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  CloudWorkspaceIcon,
  InformationFillDuotoneIcon,
  LocalWorkspaceIcon,
  NoNetworkIcon,
  UnsyncIcon,
} from '@blocksuite/icons';
import { useService, Workspace } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { debounce } from 'lodash-es';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';

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

const SyncingWorkspaceStatus = ({ progress }: { progress?: number }) => {
  return (
    <>
      <Loading progress={progress} speed={progress ? 0 : undefined} />
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

const useSyncEngineSyncProgress = () => {
  const t = useAFFiNEI18N();
  const isOnline = useSystemOnline();
  const pushNotification = useSetAtom(pushNotificationAtom);
  const { syncing, progress, retrying, errorMessage } = useDocEngineStatus();
  const [isOverCapacity, setIsOverCapacity] = useState(false);

  const currentWorkspace = useService(Workspace);
  const isOwner = useIsWorkspaceOwner(currentWorkspace.meta);

  const setSettingModalAtom = useSetAtom(openSettingModalAtom);
  const jumpToPricePlan = useCallback(async () => {
    setSettingModalAtom({
      open: true,
      activeTab: 'plans',
    });
  }, [setSettingModalAtom]);

  // debounce sync engine status
  useEffect(() => {
    const disposableOverCapacity =
      currentWorkspace.engine.blob.onStatusChange.on(
        debounce(status => {
          const isOver = status?.isStorageOverCapacity;
          if (!isOver) {
            setIsOverCapacity(false);
            return;
          }
          setIsOverCapacity(true);
          if (isOwner) {
            pushNotification({
              type: 'warning',
              title: t['com.affine.payment.storage-limit.title'](),
              message:
                t['com.affine.payment.storage-limit.description.owner'](),
              actionLabel: t['com.affine.payment.storage-limit.view'](),
              action: jumpToPricePlan,
            });
          } else {
            pushNotification({
              type: 'warning',
              title: t['com.affine.payment.storage-limit.title'](),
              message:
                t['com.affine.payment.storage-limit.description.member'](),
            });
          }
        })
      );
    return () => {
      disposableOverCapacity?.dispose();
    };
  }, [currentWorkspace, isOwner, jumpToPricePlan, pushNotification, t]);

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
    if (syncing) {
      return (
        `Syncing with AFFiNE Cloud` +
        (progress ? ` (${Math.floor(progress * 100)}%)` : '')
      );
    } else if (retrying && errorMessage) {
      return `${errorMessage}, reconnecting.`;
    }
    if (retrying) {
      return 'Sync disconnected due to unexpected issues, reconnecting.';
    }
    if (isOverCapacity) {
      return 'Sync failed due to insufficient cloud storage space.';
    }
    return 'Synced with AFFiNE Cloud';
  }, [
    currentWorkspace.flavour,
    errorMessage,
    isOnline,
    isOverCapacity,
    progress,
    retrying,
    syncing,
  ]);

  const CloudWorkspaceSyncStatus = useCallback(() => {
    if (syncing) {
      return SyncingWorkspaceStatus({
        progress: progress ? Math.max(progress, 0.2) : undefined,
      });
    } else if (retrying) {
      return UnSyncWorkspaceStatus();
    } else {
      return CloudWorkspaceStatus();
    }
  }, [progress, retrying, syncing]);

  return {
    message: content,
    icon:
      currentWorkspace.flavour === WorkspaceFlavour.AFFINE_CLOUD ? (
        !isOnline ? (
          <OfflineStatus />
        ) : (
          <CloudWorkspaceSyncStatus />
        )
      ) : (
        <LocalWorkspaceStatus />
      ),
  };
};

const WorkspaceStatus = () => {
  const { message, icon } = useSyncEngineSyncProgress();

  return (
    <div style={{ display: 'flex' }}>
      <Tooltip content={message}>
        <StyledWorkspaceStatus>{icon}</StyledWorkspaceStatus>
      </Tooltip>
    </div>
  );
};

export const WorkspaceCard = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ ...props }, ref) => {
  const currentWorkspace = useService(Workspace);

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
