import { notify, Tooltip } from '@affine/component';
import { Avatar, type AvatarProps } from '@affine/component/ui/avatar';
import { Loading } from '@affine/component/ui/loading';
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
import { cssVar } from '@toeverything/theme';
import { useSetAtom } from 'jotai';
import { debounce } from 'lodash-es';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';

import { useSystemOnline } from '../../../../hooks/use-system-online';
import * as styles from './styles.css';

// FIXME:
// 2. Refactor the code to improve readability
const CloudWorkspaceStatus = () => {
  return (
    <>
      <CloudWorkspaceIcon />
      Cloud
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
        <InformationFillDuotoneIcon style={{ color: cssVar('errorColor') }} />
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
  const { syncing, progress, retrying, errorMessage } = useDocEngineStatus();
  const [isOverCapacity, setIsOverCapacity] = useState(false);

  const currentWorkspace = useService(Workspace);
  const isOwner = useIsWorkspaceOwner(currentWorkspace.meta);

  const setSettingModalAtom = useSetAtom(openSettingModalAtom);
  const jumpToPricePlan = useCallback(() => {
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
            notify.warning({
              title: t['com.affine.payment.storage-limit.title'](),
              message:
                t['com.affine.payment.storage-limit.description.owner'](),
              action: {
                label: t['com.affine.payment.storage-limit.view'](),
                onClick: jumpToPricePlan,
              },
            });
          } else {
            notify.warning({
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
  }, [currentWorkspace, isOwner, jumpToPricePlan, t]);

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
    active:
      currentWorkspace.flavour === WorkspaceFlavour.AFFINE_CLOUD &&
      ((syncing && progress !== undefined) || isOverCapacity || !isOnline),
  };
};
const usePauseAnimation = (timeToResume = 5000) => {
  const [paused, setPaused] = useState(false);

  const resume = useCallback(() => {
    setPaused(false);
  }, []);

  const pause = useCallback(() => {
    setPaused(true);
    if (timeToResume > 0) {
      setTimeout(resume, timeToResume);
    }
  }, [resume, timeToResume]);

  return { paused, pause };
};

const WorkspaceInfo = ({ name }: { name: string }) => {
  const { message, active } = useSyncEngineSyncProgress();
  const currentWorkspace = useService(Workspace);
  const isCloud = currentWorkspace.flavour === WorkspaceFlavour.AFFINE_CLOUD;
  const { progress } = useDocEngineStatus();
  const { paused, pause } = usePauseAnimation();

  // to make sure that animation will play first time
  const [delayActive, setDelayActive] = useState(false);
  useEffect(() => {
    if (paused) {
      return;
    }
    const delayOpen = 0;
    const delayClose = 200;
    let timer: ReturnType<typeof setTimeout>;
    if (active) {
      timer = setTimeout(() => {
        setDelayActive(active);
      }, delayOpen);
    } else {
      timer = setTimeout(() => {
        setDelayActive(active);
        pause();
      }, delayClose);
    }
    return () => clearTimeout(timer);
  }, [active, pause, paused]);

  return (
    <div className={styles.workspaceInfoSlider} data-active={delayActive}>
      <div className={styles.workspaceInfoSlide}>
        <div className={styles.workspaceInfo} data-type="normal">
          <div className={styles.workspaceName} data-testid="workspace-name">
            {name}
          </div>
          <div className={styles.workspaceStatus}>
            {isCloud ? <CloudWorkspaceStatus /> : <LocalWorkspaceStatus />}
          </div>
        </div>

        {/* when syncing/offline/... */}
        <div className={styles.workspaceInfo} data-type="events">
          <Tooltip
            content={message}
            options={{ className: styles.workspaceInfoTooltip }}
          >
            <div className={styles.workspaceActiveStatus}>
              <SyncingWorkspaceStatus progress={progress} />
            </div>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

const avatarImageProps = {
  style: { borderRadius: 3 },
} satisfies AvatarProps['imageProps'];
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
    <div
      className={styles.container}
      role="button"
      tabIndex={0}
      data-testid="current-workspace"
      id="current-workspace"
      ref={ref}
      {...props}
    >
      <Avatar
        imageProps={avatarImageProps}
        fallbackProps={avatarImageProps}
        data-testid="workspace-avatar"
        size={32}
        url={avatarUrl}
        name={name}
        colorfulFallback
      />
      <WorkspaceInfo name={name} />
    </div>
  );
});

WorkspaceCard.displayName = 'WorkspaceCard';
