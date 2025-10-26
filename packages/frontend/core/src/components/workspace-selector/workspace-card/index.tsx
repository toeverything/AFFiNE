import { Button, notify, Skeleton, Tooltip } from '@affine/component';
import { Loading } from '@affine/component/ui/loading';
import { useSystemOnline } from '@affine/core/components/hooks/use-system-online';
import { useWorkspace } from '@affine/core/components/hooks/use-workspace';
import { useWorkspaceInfo } from '@affine/core/components/hooks/use-workspace-info';
import {
  type WorkspaceMetadata,
  type WorkspaceProfileInfo,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { useI18n } from '@affine/i18n';
import {
  ArrowDownSmallIcon,
  CloudWorkspaceIcon,
  CollaborationIcon,
  DoneIcon,
  InformationFillDuotoneIcon,
  LocalWorkspaceIcon,
  NoNetworkIcon,
  SettingsIcon,
  TeamWorkspaceIcon,
  UnsyncIcon,
} from '@blocksuite/icons/rc';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';

import { useAsyncCallback } from '../../hooks/affine-async-hooks';
import { useCatchEventCallback } from '../../hooks/use-catch-event-hook';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';
import { WorkspaceAvatar } from '../../workspace-avatar';
import * as styles from './styles.css';
export { PureWorkspaceCard } from './pure-workspace-card';

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
    useMemo(() => {
      return workspace
        ? LiveData.from(workspace.engine.doc.state$, null)
        : null;
    }, [workspace])
  );

  if (!engineState || !workspace) {
    return null;
  }

  const progress =
    (engineState.total - engineState.syncing) / engineState.total;
  const syncing = engineState.syncing > 0 || engineState.syncRetrying;

  let content;
  // TODO(@eyhn): add i18n
  if (workspace.flavour === 'local') {
    if (!BUILD_CONFIG.isElectron) {
      content = 'This is a local demo workspace.';
    } else {
      content = 'Saved locally';
    }
  } else if (!isOnline) {
    content = 'Disconnected, please check your network connection';
  } else if (engineState.syncRetrying && engineState.syncErrorMessage) {
    content = `${engineState.syncErrorMessage}, reconnecting.`;
  } else if (engineState.syncRetrying) {
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
    } else if (engineState.syncRetrying) {
      return UnSyncWorkspaceStatus();
    } else {
      return CloudWorkspaceStatus();
    }
  };

  return {
    message: content,
    icon:
      workspace.flavour !== 'local' ? (
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
      workspace.flavour !== 'local' &&
      ((syncing && progress !== undefined) || engineState.syncRetrying), // active if syncing or retrying,
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
  dense,
}: {
  workspaceMetadata: WorkspaceMetadata;
  workspaceProfile: WorkspaceProfileInfo;
  dense?: boolean;
}) => {
  const syncStatus = useSyncEngineSyncProgress(workspaceMetadata);
  const isCloud = workspaceMetadata.flavour !== 'local';
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
    <div
      className={styles.workspaceInfoSlider}
      data-active={delayActive}
      data-dense={dense}
    >
      <div className={styles.workspaceInfoSlide}>
        <div className={styles.workspaceInfo} data-type="normal">
          <div className={styles.workspaceName} data-testid="workspace-name">
            {workspaceProfile.name}
          </div>
          {!dense ? (
            <div className={styles.workspaceStatus}>
              {isCloud ? <CloudWorkspaceStatus /> : <LocalWorkspaceStatus />}
            </div>
          ) : null}
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
    hideTeamWorkspaceIcon?: boolean;
    active?: boolean;
    infoClassName?: string;
    dense?: boolean;
    onClickOpenSettings?: (workspaceMetadata: WorkspaceMetadata) => void;
    onClickEnableCloud?: (workspaceMetadata: WorkspaceMetadata) => void;
  }
>(
  (
    {
      workspaceMetadata,
      showSyncStatus,
      showArrowDownIcon,
      onClickOpenSettings,
      onClickEnableCloud,
      className,
      infoClassName,
      disable,
      hideCollaborationIcon,
      hideTeamWorkspaceIcon,
      active,
      dense,
      avatarSize = dense ? 20 : 32,
      ...props
    },
    ref
  ) => {
    const t = useI18n();
    const information = useWorkspaceInfo(workspaceMetadata);
    const workspacesService = useService(WorkspacesService);
    const navigate = useNavigateHelper();

    const name = information?.name ?? UNTITLED_WORKSPACE_NAME;

    const onEnableCloud = useCatchEventCallback(() => {
      onClickEnableCloud?.(workspaceMetadata);
    }, [onClickEnableCloud, workspaceMetadata]);

    const onRemoveWorkspace = useAsyncCallback(async () => {
      await workspacesService
        .deleteWorkspace(workspaceMetadata)
        .then(() => {
          notify.success({ title: t['Successfully removed workspace']() });
          navigate.jumpToIndex();
        })
        .catch(() => {
          notify.error({ title: t['Failed to remove workspace']() });
        });
    }, [workspacesService, workspaceMetadata, t, navigate]);

    const onOpenSettings = useCatchEventCallback(() => {
      onClickOpenSettings?.(workspaceMetadata);
    }, [onClickOpenSettings, workspaceMetadata]);

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
        <div className={clsx(styles.infoContainer, infoClassName)}>
          {information ? (
            <WorkspaceAvatar
              className={styles.avatar}
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
                  dense={dense}
                />
              ) : (
                <span className={styles.workspaceName}>{information.name}</span>
              )
            ) : (
              <Skeleton width={100} />
            )}
          </div>
          {information?.isEmpty && information.isOwner ? (
            <Button onClick={onRemoveWorkspace}>Remove</Button>
          ) : null}
          <div className={styles.showOnCardHover}>
            {onClickEnableCloud && workspaceMetadata.flavour === 'local' ? (
              <Button
                className={styles.enableCloudButton}
                onClick={onEnableCloud}
              >
                Enable Cloud
              </Button>
            ) : null}

            {onClickOpenSettings && (
              <div className={styles.settingButton} onClick={onOpenSettings}>
                <SettingsIcon width={16} height={16} />
              </div>
            )}
          </div>
        </div>

        <div className={styles.suffixIcons}>
          {hideCollaborationIcon || information?.isOwner ? null : (
            <Tooltip
              content={t['com.affine.settings.workspace.state.joined']()}
            >
              <CollaborationIcon className={styles.collaborationIcon} />
            </Tooltip>
          )}
          {hideTeamWorkspaceIcon || !information?.isTeam ? null : (
            <Tooltip content={t['com.affine.settings.workspace.state.team']()}>
              <TeamWorkspaceIcon className={styles.collaborationIcon} />
            </Tooltip>
          )}
          {active && (
            <div className={styles.activeContainer}>
              <DoneIcon className={styles.activeIcon} />
            </div>
          )}
          {showArrowDownIcon && <ArrowDownSmallIcon />}
        </div>
      </div>
    );
  }
);

WorkspaceCard.displayName = 'WorkspaceCard';
