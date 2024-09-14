import { Button, Skeleton, Tooltip } from '@affine/component';
import { Loading } from '@affine/component/ui/loading';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { useSystemOnline } from '@affine/core/components/hooks/use-system-online';
import { useWorkspace } from '@affine/core/components/hooks/use-workspace';
import { useWorkspaceInfo } from '@affine/core/components/hooks/use-workspace-info';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  ArrowDownSmallIcon,
  CloudWorkspaceIcon,
  CollaborationIcon,
  InformationFillDuotoneIcon,
  LocalWorkspaceIcon,
  NoNetworkIcon,
  SettingsIcon,
  UnsyncIcon,
} from '@blocksuite/icons/rc';
import {
  useLiveData,
  type WorkspaceMetadata,
  type WorkspaceProfileInfo,
} from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useEffect, useState } from 'react';

import * as styles from './styles.css';

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
      <Loading progress={progress} speed={0} />
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
      {!BUILD_CONFIG.isElectron ? (
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

const useSyncEngineSyncProgress = (meta: WorkspaceMetadata) => {
  const isOnline = useSystemOnline();
  const workspace = useWorkspace(meta);

  const engineState = useLiveData(
    workspace?.engine.docEngineState$.throttleTime(100)
  );

  if (!engineState || !workspace) {
    return null;
  }

  const progress =
    (engineState.total - engineState.syncing) / engineState.total;
  const syncing = engineState.syncing > 0 || engineState.retrying;

  let content;
  // TODO(@eyhn): add i18n
  if (workspace.flavour === WorkspaceFlavour.LOCAL) {
    if (!BUILD_CONFIG.isElectron) {
      content = 'This is a local demo workspace.';
    } else {
      content = 'Saved locally';
    }
  } else if (!isOnline) {
    content = 'Disconnected, please check your network connection';
  } else if (engineState.retrying && engineState.errorMessage) {
    content = `${engineState.errorMessage}, reconnecting.`;
  } else if (engineState.retrying) {
    content = 'Sync disconnected due to unexpected issues, reconnecting.';
  } else if (syncing) {
    content =
      `Syncing with AFFiNE Cloud` +
      (progress ? ` (${Math.floor(progress * 100)}%)` : '');
  } else {
    content = 'Synced with AFFiNE Cloud';
  }

  const CloudWorkspaceSyncStatus = () => {
    if (syncing) {
      return SyncingWorkspaceStatus({
        progress: progress ? Math.max(progress, 0.2) : undefined,
      });
    } else if (engineState.retrying) {
      return UnSyncWorkspaceStatus();
    } else {
      return CloudWorkspaceStatus();
    }
  };

  return {
    message: content,
    icon:
      workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD ? (
        !isOnline ? (
          <OfflineStatus />
        ) : (
          <CloudWorkspaceSyncStatus />
        )
      ) : (
        <LocalWorkspaceStatus />
      ),
    progress,
    active:
      workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD &&
      ((syncing && progress !== undefined) || engineState.retrying), // active if syncing or retrying,
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

const WorkspaceSyncInfo = ({
  workspaceMetadata,
  workspaceProfile,
}: {
  workspaceMetadata: WorkspaceMetadata;
  workspaceProfile: WorkspaceProfileInfo;
}) => {
  const syncStatus = useSyncEngineSyncProgress(workspaceMetadata);
  const isCloud = workspaceMetadata.flavour === WorkspaceFlavour.AFFINE_CLOUD;
  const { paused, pause } = usePauseAnimation();

  // to make sure that animation will play first time
  const [delayActive, setDelayActive] = useState(false);
  useEffect(() => {
    if (paused || !syncStatus) {
      return;
    }
    const delayOpen = 0;
    const delayClose = 200;
    let timer: ReturnType<typeof setTimeout>;
    if (syncStatus.active) {
      timer = setTimeout(() => {
        setDelayActive(syncStatus.active);
      }, delayOpen);
    } else {
      timer = setTimeout(() => {
        setDelayActive(syncStatus.active);
        pause();
      }, delayClose);
    }
    return () => clearTimeout(timer);
  }, [pause, paused, syncStatus]);

  if (!workspaceProfile) {
    return null;
  }

  return (
    <div className={styles.workspaceInfoSlider} data-active={delayActive}>
      <div className={styles.workspaceInfoSlide}>
        <div className={styles.workspaceInfo} data-type="normal">
          <div className={styles.workspaceName} data-testid="workspace-name">
            {workspaceProfile.name}
          </div>
          <div className={styles.workspaceStatus}>
            {isCloud ? <CloudWorkspaceStatus /> : <LocalWorkspaceStatus />}
          </div>
        </div>

        {/* when syncing/offline/... */}
        {syncStatus && (
          <div className={styles.workspaceInfo} data-type="events">
            <Tooltip
              content={syncStatus.message}
              options={{ className: styles.workspaceInfoTooltip }}
            >
              <div className={styles.workspaceActiveStatus}>
                <SyncingWorkspaceStatus progress={syncStatus.progress} />
              </div>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
};

export const WorkspaceCard = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    workspaceMetadata: WorkspaceMetadata;
    showSyncStatus?: boolean;
    showArrowDownIcon?: boolean;
    avatarSize?: number;
    disable?: boolean;
    hideCollaborationIcon?: boolean;
    onClickOpenSettings?: (workspaceMetadata: WorkspaceMetadata) => void;
    onClickEnableCloud?: (workspaceMetadata: WorkspaceMetadata) => void;
  }
>(
  (
    {
      workspaceMetadata,
      showSyncStatus,
      showArrowDownIcon,
      avatarSize = 32,
      onClickOpenSettings,
      onClickEnableCloud,
      className,
      disable,
      hideCollaborationIcon,
      ...props
    },
    ref
  ) => {
    const information = useWorkspaceInfo(workspaceMetadata);

    const name = information?.name ?? UNTITLED_WORKSPACE_NAME;

    return (
      <div
        className={clsx(
          styles.container,
          disable ? styles.disable : null,
          className
        )}
        role="button"
        tabIndex={0}
        data-testid="workspace-card"
        ref={ref}
        {...props}
      >
        {information ? (
          <WorkspaceAvatar
            meta={workspaceMetadata}
            rounded={3}
            data-testid="workspace-avatar"
            size={avatarSize}
            name={name}
            colorfulFallback
          />
        ) : (
          <Skeleton width={avatarSize} height={avatarSize} />
        )}
        <div className={styles.workspaceTitleContainer}>
          {information ? (
            showSyncStatus ? (
              <WorkspaceSyncInfo
                workspaceProfile={information}
                workspaceMetadata={workspaceMetadata}
              />
            ) : (
              <span className={styles.workspaceName}>{information.name}</span>
            )
          ) : (
            <Skeleton width={100} />
          )}
        </div>
        {onClickEnableCloud &&
        workspaceMetadata.flavour === WorkspaceFlavour.LOCAL ? (
          <Button
            className={styles.showOnCardHover}
            onClick={e => {
              e.stopPropagation();
              onClickEnableCloud(workspaceMetadata);
            }}
          >
            Enable Cloud
          </Button>
        ) : null}
        {hideCollaborationIcon || information?.isOwner ? null : (
          <CollaborationIcon />
        )}
        {onClickOpenSettings && (
          <div
            className={styles.settingButton}
            onClick={e => {
              e.stopPropagation();
              onClickOpenSettings(workspaceMetadata);
            }}
          >
            <SettingsIcon width={16} height={16} />
          </div>
        )}
        {showArrowDownIcon && <ArrowDownSmallIcon />}
      </div>
    );
  }
);

WorkspaceCard.displayName = 'WorkspaceCard';
